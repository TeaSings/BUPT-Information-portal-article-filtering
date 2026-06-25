import path from "node:path";
import { paths } from "./paths.mjs";
import { writeText } from "./fs-utils.mjs";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function itemReason(article) {
  if (article.classification.reason) return article.classification.reason;
  const matches = article.classification.matchedKeywords;
  if (matches.length) return `因为它与你关注的学生事务相关，命中字段：${matches.join("、")}。`;
  return "因为它可能需要个人处理。";
}

function articleLine(article, index) {
  return `${index + 1}. [${article.title}](${article.url})
   - ${itemReason(article)}`;
}

export function buildMarkdownReport(filtered, config, targetDate) {
  const { stats, byPriority } = filtered;
  const title = `${config.email.subjectPrefix} ${targetDate}`;
  const lines = [
    `# ${title}`,
    "",
    `抓取范围：${targetDate} 发布的新闻和通知。`,
    `筛选结果：必看 ${stats.must} 条，可能有用 ${stats.watch} 条，已忽略 ${stats.skipped} 条。`,
    ""
  ];

  if (stats.kept === 0) {
    lines.push("## 今日结论", "", "前一天没有筛选出需要重点关注的新闻或通知。", "");
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
    lines.push("## 过滤说明", "");
    lines.push("邮件正文只保留标题和一句话理由；低相关度内容不会进入正文。");
  }

  return `${lines.join("\n")}\n`;
}

function renderHtmlItems(items) {
  if (!items.length) return "<p>无。</p>";
  return `<ol>${items
    .map((article) => {
      return `<li>
        <p><a href="${escapeHtml(article.url)}"><strong>${escapeHtml(article.title)}</strong></a></p>
        <p>${escapeHtml(itemReason(article))}</p>
      </li>`;
    })
    .join("\n")}</ol>`;
}

export function buildHtmlReport(filtered, config, targetDate) {
  const { stats, byPriority } = filtered;
  const title = `${config.email.subjectPrefix} ${targetDate}`;

  const body =
    stats.kept === 0
      ? "<h2>今日结论</h2><p>前一天没有筛选出需要重点关注的新闻或通知。</p>"
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
    li { margin-bottom: 18px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">抓取范围：${escapeHtml(targetDate)} 发布的新闻和通知。</p>
  <p class="meta">筛选结果：必看 ${stats.must} 条，可能有用 ${stats.watch} 条，已忽略 ${stats.skipped} 条。</p>
  ${body}
  <hr>
  <p class="meta">邮件正文只保留标题和一句话理由；低相关度内容不会进入正文。</p>
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
