import path from "node:path";
import { parseArgs, hasFlag } from "./lib/args.mjs";
import { loadConfig } from "./lib/config.mjs";
import { assertYmd, getTargetDate } from "./lib/date-utils.mjs";
import { crawlPortal } from "./lib/crawler.mjs";
import { paths } from "./lib/paths.mjs";
import { writeJson } from "./lib/fs-utils.mjs";
import { saveReports } from "./lib/report-lib.mjs";
import {
  cleanupDailyQueue,
  enqueueDailyReport,
  processPendingQueue,
  requeueIfMissingRecipients
} from "./lib/queue.mjs";
import { reviewArticlesWithAi } from "./lib/ai-review.mjs";

const args = parseArgs();
const config = await loadConfig();
const targetDate = getTargetDate(args, config);
assertYmd(targetDate);

const rawPath = path.join(paths.dataDir, `${targetDate}.raw.json`);
const filteredPath = path.join(paths.dataDir, `${targetDate}.filtered.json`);

console.log(`Running daily BUPT portal monitor for ${targetDate}...`);
const crawlResult = await crawlPortal({
  config,
  targetDate,
  headless: hasFlag(args, "headful") ? false : undefined,
  debug: hasFlag(args, "debug")
});
await writeJson(rawPath, crawlResult);

if (crawlResult.needLogin) {
  console.error("Portal login is required or the saved login state expired.");
  console.error("Run: npm run login");
  process.exit(2);
}

const filtered = await reviewArticlesWithAi({
  articles: crawlResult.articles,
  config,
  targetDate
});
filtered.targetDate = targetDate;
await writeJson(filteredPath, filtered);

const reports = await saveReports(filtered, config, targetDate);
console.log(`Saved report: ${reports.markdownPath}`);

const queued = await enqueueDailyReport({
  config,
  targetDate,
  filtered,
  markdown: reports.markdown,
  html: reports.html,
  reportPaths: {
    markdown: reports.markdownPath,
    html: reports.htmlPath
  },
  force: hasFlag(args, "force")
});

if (queued.enqueued) {
  console.log(`Queued daily email job: ${queued.path}`);
} else {
  console.log(`Daily email job for ${targetDate} already exists in ${queued.status}.`);
  if (queued.status === "sent") {
    const delivery = await requeueIfMissingRecipients(config, targetDate);
    if (delivery.requeued) {
      console.log(`Requeued daily email job for ${targetDate}; missing ${delivery.missing.length} current recipient(s).`);
    }
  }
}

if (hasFlag(args, "no-send")) {
  console.log("Skipped queue processing because --no-send was provided.");
  process.exit(0);
}

const results = await processPendingQueue(config, { stopOnFailure: true });
for (const result of results) {
  if (result.ok) {
    console.log(`Email sent for ${result.targetDate}: ${result.messageId}`);
  } else {
    console.error(`Email failed for ${result.targetDate}: ${result.error}`);
  }
}

const cleaned = await cleanupDailyQueue(config);
if (cleaned.length) {
  console.log(`Cleaned ${cleaned.length} old daily queue file(s).`);
}

if (results.some((result) => !result.ok)) {
  process.exitCode = 3;
}
