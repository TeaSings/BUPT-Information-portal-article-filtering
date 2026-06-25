import { parseArgs, hasFlag } from "./lib/args.mjs";
import { loadConfig } from "./lib/config.mjs";
import { assertYmd, getTargetDate } from "./lib/date-utils.mjs";
import { readJson } from "./lib/fs-utils.mjs";
import { saveReports } from "./lib/report-lib.mjs";
import { paths } from "./lib/paths.mjs";
import path from "node:path";
import { enqueueDailyReport, processPendingQueue } from "./lib/queue.mjs";

const args = parseArgs();
const config = await loadConfig();
const targetDate = getTargetDate(args, config);
assertYmd(targetDate);

const filteredPath = path.join(paths.dataDir, `${targetDate}.filtered.json`);
const filtered = await readJson(filteredPath);
if (!filtered) {
  throw new Error(`Missing filtered data: ${filteredPath}. Run npm run check first.`);
}

const reports = await saveReports(filtered, config, targetDate);
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
}

const results = await processPendingQueue(config, {
  stopOnFailure: hasFlag(args, "stop-on-failure")
});

for (const result of results) {
  if (result.ok) {
    console.log(`Sent ${result.targetDate}: ${result.messageId}`);
  } else {
    console.error(`Failed ${result.targetDate}: ${result.error}`);
  }
}

if (results.some((result) => !result.ok)) {
  process.exitCode = 3;
}
