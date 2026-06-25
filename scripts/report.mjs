import path from "node:path";
import { parseArgs } from "./lib/args.mjs";
import { loadConfig } from "./lib/config.mjs";
import { assertYmd, getTargetDate } from "./lib/date-utils.mjs";
import { paths } from "./lib/paths.mjs";
import { readJson } from "./lib/fs-utils.mjs";
import { saveReports } from "./lib/report-lib.mjs";

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
console.log(`Saved report: ${reports.markdownPath}`);
console.log(`Saved HTML report: ${reports.htmlPath}`);
