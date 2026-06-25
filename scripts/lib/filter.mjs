function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function matchKeywords(text, keywords) {
  return keywords.filter((keyword) => text.includes(keyword));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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

function isPastNews(article, text) {
  if (article.section !== "news") return false;
  return /举办|召开|来访|调研|圆满|落幕|顺利召开|顺利举行|开展.*活动|斩获|喜报/.test(text);
}

function hasTitleActionSignal(article) {
  return /通知|公示|报名|申报|申请|领取|安排|截止|评选|名单|选课|考试|征集/.test(
    normalize(article.title)
  );
}

function buildReason(matchedKeywords, actionFields) {
  const fields = unique([...matchedKeywords, ...actionFields]);
  if (!fields.length) return "因为它可能需要个人处理。";
  if (actionFields.length) {
    return `因为它包含可行动信息，命中字段：${fields.join("、")}。`;
  }
  return `因为它与你关注的学生事务相关，命中字段：${fields.join("、")}。`;
}

export function classifyArticle(article, config) {
  const text = normalize(`${article.title} ${article.source} ${article.content}`);
  const mustMatches = matchKeywords(text, config.focus.mustReadKeywords);
  const watchMatches = matchKeywords(text, config.focus.watchKeywords);
  const ignoreMatches = matchKeywords(text, config.focus.ignoreKeywords);
  const hardIgnoreMatches = matchKeywords(text, config.focus.hardIgnoreKeywords || []);
  const studentScopeMatches = matchKeywords(text, config.focus.studentScopeKeywords || []);

  const actionFields = [];
  if (/截止|公示期|逾期/.test(text)) actionFields.push("截止/公示期");
  if (/报名|提交|申请|申报|推报/.test(text)) actionFields.push("报名/申请");
  if (/考试|选课|缴费|体检/.test(text)) actionFields.push("教务/事务办理");
  if (/名单|结果|获奖|领取/.test(text)) actionFields.push("名单/领取");
  if (/招聘|实习|就业/.test(text)) actionFields.push("实习就业");
  const hasActionSignal = actionFields.length > 0;
  const actionHints = extractActionHints(article);
  const broadMust = new Set(["竞赛", "创新创业", "教务", "就业", "交换", "访学"]);
  const strongMustMatches = mustMatches.filter((keyword) => !broadMust.has(keyword));

  if (hardIgnoreMatches.length > 0) {
    return {
      priority: "skip",
      priorityLabel: "已忽略",
      matchedKeywords: unique(hardIgnoreMatches),
      actionHints,
      reason: `已过滤行政/低相关内容，命中字段：${unique(hardIgnoreMatches).join("、")}。`,
      keep: false
    };
  }

  if (isPastNews(article, text) && !hasTitleActionSignal(article)) {
    return {
      priority: "skip",
      priorityLabel: "已忽略",
      matchedKeywords: unique(ignoreMatches),
      actionHints,
      reason: "已过滤事后新闻报道。",
      keep: false
    };
  }

  if (strongMustMatches.length > 0 || (mustMatches.length > 0 && hasActionSignal)) {
    const matchedKeywords = unique([...mustMatches, ...studentScopeMatches, ...actionFields]);
    return {
      priority: "must",
      priorityLabel: "必看",
      matchedKeywords,
      actionHints,
      reason: buildReason(matchedKeywords, actionFields),
      keep: true
    };
  }

  if (watchMatches.length > 0 && hasActionSignal) {
    const matchedKeywords = unique([...watchMatches, ...studentScopeMatches, ...actionFields]);
    return {
      priority: "watch",
      priorityLabel: "可能有用",
      matchedKeywords,
      actionHints,
      reason: buildReason(matchedKeywords, actionFields),
      keep: true
    };
  }

  return {
    priority: "skip",
    priorityLabel: "已忽略",
    matchedKeywords: unique(ignoreMatches),
    actionHints,
    reason: ignoreMatches.length
      ? `已过滤低相关内容，命中字段：${unique(ignoreMatches).join("、")}。`
      : "没有命中需要关注的学生事务字段。",
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
