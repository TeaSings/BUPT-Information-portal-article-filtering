import nodemailer from "nodemailer";

function requireValue(value, name) {
  if (!value) throw new Error(`Missing ${name}. Fill it in .env first.`);
  return value;
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

export async function sendReportEmail({ config, filtered, targetDate, markdown, html }) {
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
  const toAddress = requireValue(smtp.to, "MAIL_TO");
  const from = config.email.fromName
    ? `"${config.email.fromName}" <${fromAddress}>`
    : fromAddress;

  const info = await transporter.sendMail({
    from,
    to: toAddress,
    subject: buildSubject(filtered, config, targetDate),
    text: markdown,
    html
  });

  return {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected
  };
}
