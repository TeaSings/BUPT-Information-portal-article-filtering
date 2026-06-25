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

function itemReason(article) {
  if (article.classification.reason) return article.classification.reason;
  return "这条信息可能需要你留意。";
}

function articleLine(article, index) {
  return `${index + 1}. [${article.title}](${article.url})
   - 为什么发给你：${itemReason(article)}`;
}

export function buildMarkdownReport(filtered, config, targetDate) {
  const { stats, byPriority } = filtered;
  const dateText = formatChineseDate(targetDate);
  const title = `${config.email.subjectPrefix}｜${dateText}`;
  const overall = filtered.ai?.overall || "我已经帮你读完了当天发布的新闻和通知。";
  const lines = [
    `# ${title}`,
    "",
    `早上好！请查收${dateText}的信息门户日报。`,
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

  return `${lines.join("\n")}\n`;
}

function renderHtmlItems(items) {
  if (!items.length) return "<p>无。</p>";
  return `<ol>${items
    .map((article) => {
      return `<li>
        <p><a href="${escapeHtml(article.url)}"><strong>${escapeHtml(article.title)}</strong></a></p>
        <p><strong>为什么发给你：</strong>${escapeHtml(itemReason(article))}</p>
      </li>`;
    })
    .join("\n")}</ol>`;
}

export function buildHtmlReport(filtered, config, targetDate) {
  const { stats, byPriority } = filtered;
  const dateText = formatChineseDate(targetDate);
  const title = `${config.email.subjectPrefix}｜${dateText}`;
  const overall = filtered.ai?.overall || "我已经帮你读完了当天发布的新闻和通知。";

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
  <p class="hello">早上好！请查收${escapeHtml(dateText)}的信息门户日报。</p>
  <p>${escapeHtml(overall)}</p>
  <p class="meta">我阅读了 ${stats.reviewed ?? stats.total} 条新闻和通知，筛出 ${stats.kept} 条值得关注的信息。</p>
  ${body}
  <hr>
  <p class="meta">其余 ${stats.skipped} 条我没有放进正文，主要是低相关通知、行政公示或新闻回顾。</p>
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
