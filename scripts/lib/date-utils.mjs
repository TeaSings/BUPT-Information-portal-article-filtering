export function formatYmd(date, timeZone = "Asia/Shanghai") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function yesterdayYmd(timeZone = "Asia/Shanghai", now = new Date()) {
  return formatYmd(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone);
}

export function getTargetDate(args, config) {
  if (args.date) return args.date;
  if (process.env.TARGET_DATE) return process.env.TARGET_DATE;
  return yesterdayYmd(config.portal.timezone);
}

function normalizeDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseDateFromText(text, targetDate) {
  if (!text) return null;
  const compact = String(text).replace(/\s+/g, " ");

  const full = compact.match(/(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*(?:日)?/);
  if (full) return normalizeDateParts(full[1], full[2], full[3]);

  const cn = compact.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (cn) return normalizeDateParts(cn[1], cn[2], cn[3]);

  const targetYear = targetDate ? targetDate.slice(0, 4) : String(new Date().getFullYear());
  const monthDay = compact.match(/(?:^|[^\d])(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})\s*(?:日)?(?:$|[^\d])/);
  if (monthDay) return normalizeDateParts(targetYear, monthDay[1], monthDay[2]);

  return null;
}

export function assertYmd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date "${value}". Expected YYYY-MM-DD.`);
  }
}
