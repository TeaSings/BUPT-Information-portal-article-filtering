import fs from "node:fs/promises";
import OpenAI from "openai";

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, maxChars) {
  const text = cleanText(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function stripCodeFence(value) {
  const text = String(value || "").trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1].trim() : text;
}

function parseJsonObject(value) {
  const text = stripCodeFence(value);
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw error;
  }
}

function normalizePriority(value) {
  return value === "watch" ? "watch" : "must";
}

function normalizeSection(value, priority = "must") {
  if (value === "summary") return "summary";
  if (value === "open") return "open";
  return priority === "watch" ? "summary" : "open";
}

function normalizeSummary(value) {
  const text = cleanText(value);
  if (!text) return "这篇文章包含一条可能需要关注的信息。";
  return text.endsWith("。") || text.endsWith("！") || text.endsWith("？")
    ? text
    : `${text}。`;
}

function normalizeOpenReason(value, section) {
  const text = cleanText(value);
  if (section !== "open") return "";
  if (!text) return "原文里可能有入口、附件或具体说明，建议打开确认。";
  return text.endsWith("。") || text.endsWith("！") || text.endsWith("？")
    ? text
    : `${text}。`;
}

function articleId(index) {
  return `a${String(index + 1).padStart(3, "0")}`;
}

function imageOcrText(article, maxChars) {
  const text = (article.images || [])
    .map((image, index) => {
      const ocrText = cleanText(image.ocrText);
      if (!ocrText) return "";
      return `图片${index + 1} OCR：${ocrText}`;
    })
    .filter(Boolean)
    .join("\n");
  return truncate(text, maxChars);
}

function prepareArticles(articles, config) {
  const maxArticles = config.deepseek.maxArticles;
  const maxContentChars = config.deepseek.maxContentChars;
  const maxImageOcrChars = config.deepseek.maxImageOcrChars;

  return articles
    .filter((article) => cleanText(article.title).length > 0)
    .filter((article) => {
      const content = cleanText(article.content || article.excerpt);
      const ocrText = imageOcrText(article, maxImageOcrChars);
      return cleanText(`${content} ${ocrText}`).length >= 20;
    })
    .slice(0, maxArticles)
    .map((article, index) => {
      const imageText = imageOcrText(article, maxImageOcrChars);
      return {
        id: articleId(index),
        section: article.sectionLabel || article.section || "",
        title: cleanText(article.title),
        source: cleanText(article.source),
        url: article.url,
        date: article.date,
        content: truncate(article.content || article.excerpt, maxContentChars),
        image_count: (article.images || []).length,
        image_ocr_text: imageText,
        original: article
      };
    });
}

function buildUserPayload(targetDate, preparedArticles) {
  return JSON.stringify(
    {
      date: targetDate,
      article_count: preparedArticles.length,
      articles: preparedArticles.map(({ original, ...article }) => article)
    },
    null,
    2
  );
}

function buildFilteredFromAi({ targetDate, articles, preparedArticles, aiResult, model }) {
  const byId = new Map(preparedArticles.map((article) => [article.id, article]));
  const used = new Set();

  const kept = [];
  for (const item of Array.isArray(aiResult.items) ? aiResult.items : []) {
    const prepared = byId.get(cleanText(item.id));
    if (!prepared || used.has(prepared.id)) continue;
    used.add(prepared.id);

    const fallbackPriority = normalizePriority(item.priority);
    const section = normalizeSection(item.section, fallbackPriority);
    const priority = item.priority ? fallbackPriority : section === "open" ? "must" : "watch";
    const summary = normalizeSummary(item.summary);
    const openReason = normalizeOpenReason(item.open_reason, section);
    kept.push({
      ...prepared.original,
      ai: {
        id: prepared.id,
        model
      },
      classification: {
        priority,
        priorityLabel: priority === "must" ? "必看" : "可能有用",
        section,
        sectionLabel: section === "open" ? "需要点开确认" : "读摘要就够了",
        summary,
        openReason,
        actionHints: [],
        keep: true,
        reviewedBy: "deepseek"
      }
    });
  }

  const keptKeys = new Set(kept.map((article) => article.url || article.title));
  const skipped = articles
    .filter((article) => !keptKeys.has(article.url || article.title))
    .map((article) => ({
      ...article,
      classification: {
        priority: "skip",
        priorityLabel: "已忽略",
        summary: "无需邮件提醒。",
        actionHints: [],
        keep: false,
        reviewedBy: "deepseek"
      }
    }));

  const byPriority = {
    must: kept.filter((article) => article.classification.priority === "must"),
    watch: kept.filter((article) => article.classification.priority === "watch")
  };
  const bySection = {
    open: kept.filter((article) => article.classification.section === "open"),
    summary: kept.filter((article) => article.classification.section === "summary")
  };

  return {
    targetDate,
    reviewMode: "ai",
    ai: {
      provider: "deepseek",
      model,
      overall: cleanText(aiResult.overall),
      aside: cleanText(aiResult.aside),
      reviewedArticles: preparedArticles.length
    },
    kept,
    skipped,
    byPriority,
    bySection,
    stats: {
      total: articles.length,
      reviewed: preparedArticles.length,
      kept: kept.length,
      must: byPriority.must.length,
      watch: byPriority.watch.length,
      skipped: skipped.length
    }
  };
}

export async function reviewArticlesWithAi({ articles, config, targetDate }) {
  if (!config.deepseek.apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY. Fill it in .env before running AI review.");
  }

  const preparedArticles = prepareArticles(articles, config);
  if (preparedArticles.length === 0) {
    return buildFilteredFromAi({
      targetDate,
      articles,
      preparedArticles,
      aiResult: {
        items: [],
        overall: "前一天没有可供 AI 阅读的新闻或通知正文。"
      },
      model: config.deepseek.model
    });
  }

  const systemPrompt = await fs.readFile(config.deepseek.promptPath, "utf8");
  const client = new OpenAI({
    apiKey: config.deepseek.apiKey,
    baseURL: config.deepseek.baseUrl
  });

  const completion = await client.chat.completions.create({
    model: config.deepseek.model,
    temperature: config.deepseek.temperature,
    thinking: { type: config.deepseek.thinking },
    reasoning_effort: config.deepseek.reasoningEffort,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildUserPayload(targetDate, preparedArticles) }
    ]
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek returned an empty response.");
  }

  const aiResult = parseJsonObject(content);
  return buildFilteredFromAi({
    targetDate,
    articles,
    preparedArticles,
    aiResult,
    model: config.deepseek.model
  });
}
