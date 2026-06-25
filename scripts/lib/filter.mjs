function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function matchKeywords(text, keywords) {
  return keywords.filter((keyword) => text.includes(keyword));
}

function extractActionHints(article) {
  const content = normalize(article.content);
  const sentences = content
    .split(/(?<=[。！？!?；;])\s*/)
    .map((line) => line.trim())
    .filter(Boolean);

  const hintPattern = /截止|报名|提交|申请|考试|选课|缴费|材料|时间|地点|对象|名额|公示|下载|附件/;
  return sentences
    .filter((sentence) => hintPattern.test(sentence))
    .map((sentence) => sentence.slice(0, 120))
    .slice(0, 3);
}

export function classifyArticle(article, config) {
  const text = normalize(`${article.title} ${article.source} ${article.content}`);
  const mustMatches = matchKeywords(text, config.focus.mustReadKeywords);
  const watchMatches = matchKeywords(text, config.focus.watchKeywords);
  const ignoreMatches = matchKeywords(text, config.focus.ignoreKeywords);

  const hasDeadline = /截止|报名时间|提交时间|申请时间|考试时间|缴费时间|逾期|名单公示/.test(text);
  const actionHints = extractActionHints(article);

  if (mustMatches.length > 0 || hasDeadline) {
    return {
      priority: "must",
      priorityLabel: "必看",
      matchedKeywords: [...new Set([...mustMatches, ...(hasDeadline ? ["时间节点"] : [])])],
      actionHints,
      keep: true
    };
  }

  if (watchMatches.length > 0) {
    return {
      priority: "watch",
      priorityLabel: "可能有用",
      matchedKeywords: [...new Set(watchMatches)],
      actionHints,
      keep: true
    };
  }

  return {
    priority: "skip",
    priorityLabel: "已忽略",
    matchedKeywords: [...new Set(ignoreMatches)],
    actionHints,
    keep: false
  };
}

export function filterArticles(articles, config) {
  const enriched = articles.map((article) => ({
    ...article,
    classification: classifyArticle(article, config)
  }));

  const kept = enriched.filter((article) => article.classification.keep);
  const skipped = enriched.filter((article) => !article.classification.keep);

  const byPriority = {
    must: kept.filter((article) => article.classification.priority === "must"),
    watch: kept.filter((article) => article.classification.priority === "watch")
  };

  return {
    targetDate: articles[0]?.date || null,
    kept,
    skipped,
    byPriority,
    stats: {
      total: articles.length,
      kept: kept.length,
      must: byPriority.must.length,
      watch: byPriority.watch.length,
      skipped: skipped.length
    }
  };
}
