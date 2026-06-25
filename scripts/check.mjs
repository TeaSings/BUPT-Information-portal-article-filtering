import path from "node:path";
import { parseArgs, hasFlag } from "./lib/args.mjs";
import { loadConfig } from "./lib/config.mjs";
import { assertYmd, getTargetDate } from "./lib/date-utils.mjs";
import { crawlPortal } from "./lib/crawler.mjs";
import { paths } from "./lib/paths.mjs";
import { writeJson } from "./lib/fs-utils.mjs";

const args = parseArgs();
const config = await loadConfig();
const targetDate = getTargetDate(args, config);
assertYmd(targetDate);

const result = await crawlPortal({
  config,
  targetDate,
  headless: hasFlag(args, "headful") ? false : undefined,
  debug: hasFlag(args, "debug")
});

const rawPath = path.join(paths.dataDir, `${targetDate}.raw.json`);
await writeJson(rawPath, result);

if (result.needLogin) {
  console.error("Portal login is required. Run: npm run login");
  process.exitCode = 2;
} else {
  console.log(`Saved raw data: ${rawPath}`);
  console.log(`Found ${result.articles.length} articles for ${targetDate}.`);
  console.log("Run npm run review to let DeepSeek read and select the email items.");
}
