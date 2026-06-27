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

function itemOpenReason(article) {
  return article.classification.openReason || "原文里可能有入口、附件或具体说明，建议打开确认。";
}

function reportSections(filtered) {
  if (filtered.bySection) {
    return {
      open: filtered.bySection.open || [],
      summary: filtered.bySection.summary || []
    };
  }

  return {
    open: filtered.byPriority?.must || [],
    summary: filtered.byPriority?.watch || []
  };
}

function campusAside(filtered, stats) {
  if (filtered.ai?.aside) return filtered.ai.aside;
  if (stats.kept === 0) return "今天门户比较安静，可以先把注意力留给自己的安排。";
  if (stats.must > 0) return "今天有需要点开确认的事项，建议顺手看完关键细节。";
  return "今天的信息读摘要基本够用，不用一篇篇打开原文。";
}

function serviceFooterMarkdown() {
  return [
    "来自 TeaSings 的想法，希望这份小日报能帮你少翻几页门户。",
    "意见反馈可以发邮件到 [teasings@qq.com](mailto:teasings@qq.com)。"
  ];
}

function articleMarkdown(article, needsOpen) {
  const lines = [
    `### [${article.title}](${article.url})`,
    "",
    `简要结论：${itemSummary(article)}`
  ];

  if (needsOpen) {
    lines.push("", `点开后主要确认：${itemOpenReason(article)}`);
  }

  return lines.join("\n");
}

export function buildMarkdownReport(filtered, config, targetDate, options = {}) {
  const { stats } = filtered;
  const sections = reportSections(filtered);
  const dateText = formatChineseDate(targetDate);
  const title = `${config.email.subjectPrefix}｜${dateText}`;
  const overall = filtered.ai?.overall || "我已经帮你读完了当天发布的新闻和通知。";
  const now = options.now || new Date();
  const lines = [
    `# ${title}`,
    "",
    openingLine(config, targetDate, now),
    "",
    `> 今天我读完了 ${stats.reviewed ?? stats.total} 条新闻和通知，留下 ${stats.kept} 条。`,
    `> 重点是：${overall}`,
    "",
  ];

  if (stats.kept === 0) {
    lines.push("## 今日关注", "", "今天没有需要你特别处理的事项，可以先安心跳过。", "");
  } else {
    lines.push("## 需要你点开确认", "");
    if (sections.open.length) {
      lines.push(...sections.open.map((article) => articleMarkdown(article, true)), "");
    } else {
      lines.push("无。", "");
    }

    lines.push("## 读摘要就够了", "");
    if (sections.summary.length) {
      lines.push(...sections.summary.map((article) => articleMarkdown(article, false)), "");
    } else {
      lines.push("无。", "");
    }
  }

  if (config.email.includeSkippedCount) {
    lines.push(`其余 ${stats.skipped} 条我没有放进正文，主要是低相关通知、行政公示或新闻回顾。`);
  }

  lines.push("", "## 今日小结", "");
  lines.push(campusAside(filtered, stats));
  lines.push("", "祝你在北邮有美好的一天！", "");
  lines.push(...serviceFooterMarkdown());

  return `${lines.join("\n")}\n`;
}

function renderHtmlItems(items, needsOpen) {
  if (!items.length) return '<p class="empty" style="margin: 0 0 14px; color: #66717d;">无。</p>';
  return `${items
    .map((article) => {
      const reason = needsOpen
        ? `<p class="reason" style="margin: 0 0 12px; color: #3d4f5f;"><span class="label" style="display: inline-block; margin-bottom: 3px; color: #66717d; font-size: 13px; font-weight: 600;">点开后主要确认</span><br>${escapeHtml(itemOpenReason(article))}</p>`
        : "";
      return `<section class="item" style="margin: 0 0 24px; padding: 0 0 20px; border-bottom: 1px solid #e8edf3;">
        <h3 style="margin: 0 0 12px; font-size: 16px; line-height: 1.55;"><a href="${escapeHtml(article.url)}" style="color: #0b5cad; text-decoration: none;">${escapeHtml(article.title)}</a></h3>
        <p class="summary" style="margin: 0 0 12px;"><span class="label" style="display: inline-block; margin-bottom: 3px; color: #66717d; font-size: 13px; font-weight: 600;">简要结论</span><br>${escapeHtml(itemSummary(article))}</p>
        ${reason}
      </section>`;
    })
    .join("\n")}`;
}

function sectionHeading(title) {
  return `<h2 style="margin: 30px 0 14px; font-size: 18px; line-height: 1.45;">${escapeHtml(title)}</h2>`;
}

export function buildHtmlReport(filtered, config, targetDate, options = {}) {
  const { stats } = filtered;
  const sections = reportSections(filtered);
  const dateText = formatChineseDate(targetDate);
  const title = `${config.email.subjectPrefix}｜${dateText}`;
  const overall = filtered.ai?.overall || "我已经帮你读完了当天发布的新闻和通知。";
  const now = options.now || new Date();

  const body =
    stats.kept === 0
      ? `${sectionHeading("今日关注")}<p style="margin: 0 0 14px;">今天没有需要你特别处理的事项，可以先安心跳过。</p>`
      : `${sectionHeading("需要你点开确认")}${renderHtmlItems(sections.open, true)}
         ${sectionHeading("读摘要就够了")}${renderHtmlItems(sections.summary, false)}`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; padding: 0; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; }
    .container { max-width: 680px; margin: 0 auto; padding: 28px 22px 32px; line-height: 1.78; font-size: 15px; }
    a { color: #0b5cad; text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { margin: 0 0 18px; font-size: 24px; line-height: 1.35; }
    h2 { margin: 30px 0 14px; font-size: 18px; line-height: 1.45; }
    h3 { margin: 0 0 12px; font-size: 16px; line-height: 1.55; }
    p { margin: 0 0 14px; }
    .meta { color: #66717d; font-size: 14px; }
    .hello { font-size: 16px; margin-bottom: 18px; }
    blockquote { margin: 18px 0 26px; padding: 14px 16px; border-left: 4px solid #d6e4f0; background: #f7fbff; color: #243447; }
    blockquote p { margin: 0 0 8px; }
    blockquote p:last-child { margin-bottom: 0; }
    .item { margin: 0 0 24px; padding: 0 0 20px; border-bottom: 1px solid #e8edf3; }
    .item:last-child { border-bottom: 0; }
    .summary, .reason { margin-bottom: 12px; }
    .reason { color: #3d4f5f; }
    .label { display: inline-block; margin-bottom: 3px; color: #66717d; font-size: 13px; font-weight: 600; }
    .empty { color: #66717d; }
    hr { border: 0; border-top: 1px solid #e8edf3; margin: 28px 0; }
  </style>
</head>
<body style="margin: 0; padding: 0; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #17202a;">
  <div class="container" style="max-width: 680px; margin: 0 auto; padding: 28px 22px 32px; line-height: 1.78; font-size: 15px;">
    <h1 style="margin: 0 0 18px; font-size: 24px; line-height: 1.35;">${escapeHtml(title)}</h1>
    <p class="hello" style="font-size: 16px; margin: 0 0 18px;">${escapeHtml(openingLine(config, targetDate, now))}</p>
    <blockquote style="margin: 18px 0 26px; padding: 14px 16px; border-left: 4px solid #d6e4f0; background: #f7fbff; color: #243447;">
      <p style="margin: 0 0 8px;">今天我读完了 ${stats.reviewed ?? stats.total} 条新闻和通知，留下 ${stats.kept} 条。</p>
      <p style="margin: 0;">重点是：${escapeHtml(overall)}</p>
    </blockquote>
    ${body}
    <hr style="border: 0; border-top: 1px solid #e8edf3; margin: 28px 0;">
    <p class="meta" style="margin: 0 0 14px; color: #66717d; font-size: 14px;">其余 ${stats.skipped} 条我没有放进正文，主要是低相关通知、行政公示或新闻回顾。</p>
    ${sectionHeading("今日小结")}
    <p style="margin: 0 0 14px;">${escapeHtml(campusAside(filtered, stats))}</p>
    <p style="margin: 0 0 14px;">祝你在北邮有美好的一天！</p>
    <p class="meta" style="margin: 0 0 14px; color: #66717d; font-size: 14px;">来自 TeaSings 的想法，希望这份小日报能帮你少翻几页门户。<br>
    意见反馈可以发邮件到 <a href="mailto:teasings@qq.com" style="color: #0b5cad; text-decoration: none;">teasings@qq.com</a>。</p>
  </div>
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
