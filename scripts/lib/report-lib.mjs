import path from "node:path";
import { paths } from "./paths.mjs";
import { writeText } from "./fs-utils.mjs";

function formatChineseDate(ymd) {
  const match = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return ymd;
  return `${Number(match[2])}月${Number(match[3])}日`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hourInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone || "Asia/Shanghai",
    hour: "numeric",
    hourCycle: "h23"
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value || 0);
}

function greetingFor(date, timezone) {
  const hour = hourInTimezone(date, timezone);
  if (hour >= 5 && hour < 11) return "早上好";
  if (hour >= 11 && hour < 14) return "中午好";
  if (hour >= 14 && hour < 18) return "下午好";
  if (hour >= 18 && hour < 23) return "晚上好";
  return "夜深了";
}

function openingLine(config, targetDate, now) {
  const greeting = greetingFor(now, config.portal.timezone);
  return `${greeting}！请查收${formatChineseDate(targetDate)}的信息门户日报。`;
}

function itemSummary(article) {
  if (article.classification.summary) return article.classification.summary;
  return "这篇文章包含一条可能需要关注的信息。";
}

function articleLine(article, index) {
  return `${index + 1}. [${article.title}](${article.url})
   - 内容精简：${itemSummary(article)}`;
}

export function buildMarkdownReport(filtered, config, targetDate, options = {}) {
  const { stats, byPriority } = filtered;
  const dateText = formatChineseDate(targetDate);
  const title = `${config.email.subjectPrefix}｜${dateText}`;
  const overall = filtered.ai?.overall || "我已经帮你读完了当天发布的新闻和通知。";
  const now = options.now || new Date();
  const lines = [
    `# ${title}`,
    "",
    openingLine(config, targetDate, now),
    "",
    `${overall}`,
    "",
    `我阅读了 ${stats.reviewed ?? stats.total} 条新闻和通知，筛出 ${stats.kept} 条值得关注的信息。`,
    ""
  ];

  if (stats.kept === 0) {
    lines.push("## 今日关注", "", "今天没有需要你特别处理的事项，可以先安心跳过。", "");
  } else {
    lines.push("## 必看", "");
    if (byPriority.must.length) {
      lines.push(...byPriority.must.map(articleLine), "");
    } else {
      lines.push("无。", "");
    }

    lines.push("## 可能有用", "");
    if (byPriority.watch.length) {
      lines.push(...byPriority.watch.map(articleLine), "");
    } else {
      lines.push("无。", "");
    }
  }

  if (config.email.includeSkippedCount) {
    lines.push("## 小结", "");
    lines.push(`其余 ${stats.skipped} 条我没有放进正文，主要是低相关通知、行政公示或新闻回顾。`);
  }

  lines.push("", "祝你在北邮有美好的一天！");

  return `${lines.join("\n")}\n`;
}

function renderHtmlItems(items) {
  if (!items.length) return "<p>无。</p>";
  return `<ol>${items
    .map((article) => {
      return `<li>
        <p><a href="${escapeHtml(article.url)}"><strong>${escapeHtml(article.title)}</strong></a></p>
        <p><strong>内容精简：</strong>${escapeHtml(itemSummary(article))}</p>
      </li>`;
    })
    .join("\n")}</ol>`;
}

export function buildHtmlReport(filtered, config, targetDate, options = {}) {
  const { stats, byPriority } = filtered;
  const dateText = formatChineseDate(targetDate);
  const title = `${config.email.subjectPrefix}｜${dateText}`;
  const overall = filtered.ai?.overall || "我已经帮你读完了当天发布的新闻和通知。";
  const now = options.now || new Date();

  const body =
    stats.kept === 0
      ? "<h2>今日关注</h2><p>今天没有需要你特别处理的事项，可以先安心跳过。</p>"
      : `<h2>必看</h2>${renderHtmlItems(byPriority.must)}
         <h2>可能有用</h2>${renderHtmlItems(byPriority.watch)}`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; color: #17202a; }
    a { color: #0b5cad; }
    .meta { color: #566573; }
    .hello { font-size: 16px; }
    li { margin-bottom: 18px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="hello">${escapeHtml(openingLine(config, targetDate, now))}</p>
  <p>${escapeHtml(overall)}</p>
  <p class="meta">我阅读了 ${stats.reviewed ?? stats.total} 条新闻和通知，筛出 ${stats.kept} 条值得关注的信息。</p>
  ${body}
  <hr>
  <p class="meta">其余 ${stats.skipped} 条我没有放进正文，主要是低相关通知、行政公示或新闻回顾。</p>
  <p>祝你在北邮有美好的一天！</p>
</body>
</html>`;
}

export async function saveReports(filtered, config, targetDate) {
  const markdown = buildMarkdownReport(filtered, config, targetDate);
  const html = buildHtmlReport(filtered, config, targetDate);
  const markdownPath = path.join(paths.reportsDir, `${targetDate}.md`);
  const htmlPath = path.join(paths.reportsDir, `${targetDate}.html`);
  await writeText(markdownPath, markdown);
  await writeText(htmlPath, html);
  return { markdownPath, htmlPath, markdown, html };
}
