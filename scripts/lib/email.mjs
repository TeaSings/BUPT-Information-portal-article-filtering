import nodemailer from "nodemailer";
import { buildHtmlReport, buildMarkdownReport } from "./report-lib.mjs";

function requireValue(value, name) {
  if (!value) throw new Error(`Missing ${name}. Fill it in .env first.`);
  return value;
}

export function parseRecipients(value) {
  return String(value || "")
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatChineseDate(ymd) {
  const match = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return ymd;
  return `${Number(match[2])}月${Number(match[3])}日`;
}

export function buildSubject(filtered, config, targetDate) {
  const { stats } = filtered;
  const dateText = formatChineseDate(targetDate);
  if (stats.kept === 0) {
    return `${config.email.subjectPrefix}｜${dateText}｜今日无需重点关注`;
  }
  return `${config.email.subjectPrefix}｜${dateText}｜${stats.kept} 条值得关注`;
}

export async function sendReportEmail({ config, filtered, targetDate, markdown, html, recipients = null }) {
  const smtp = config.smtp;
  const transporter = nodemailer.createTransport({
    host: requireValue(smtp.host, "SMTP_HOST"),
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: requireValue(smtp.user, "SMTP_USER"),
      pass: requireValue(smtp.pass, "SMTP_PASS")
    }
  });

  const fromAddress = requireValue(smtp.from, "MAIL_FROM");
  const toAddress = recipients ? parseRecipients(recipients).join(",") : requireValue(smtp.to, "MAIL_TO");
  if (!toAddress) throw new Error("No email recipients to send.");
  const from = config.email.fromName
    ? `"${config.email.fromName}" <${fromAddress}>`
    : fromAddress;

  const sendTime = new Date();
  const finalMarkdown = filtered
    ? buildMarkdownReport(filtered, config, targetDate, { now: sendTime })
    : markdown;
  const finalHtml = filtered
    ? buildHtmlReport(filtered, config, targetDate, { now: sendTime })
    : html;

  const info = await transporter.sendMail({
    from,
    to: toAddress,
    subject: buildSubject(filtered, config, targetDate),
    text: finalMarkdown,
    html: finalHtml
  });

  return {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    requested: parseRecipients(toAddress)
  };
}
