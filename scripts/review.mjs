import path from "node:path";
import { parseArgs } from "./lib/args.mjs";
import { loadConfig } from "./lib/config.mjs";
import { assertYmd, getTargetDate } from "./lib/date-utils.mjs";
import { paths } from "./lib/paths.mjs";
import { readJson, writeJson } from "./lib/fs-utils.mjs";
import { reviewArticlesWithAi } from "./lib/ai-review.mjs";

const args = parseArgs();
const config = await loadConfig();
const targetDate = getTargetDate(args, config);
assertYmd(targetDate);

const rawPath = path.join(paths.dataDir, `${targetDate}.raw.json`);
const raw = await readJson(rawPath);
if (!raw) {
  throw new Error(`Missing raw data: ${rawPath}. Run npm run check first.`);
}
if (raw.needLogin) {
  throw new Error("Raw crawl result says portal login is required. Run npm run login first.");
}

const filtered = await reviewArticlesWithAi({
  articles: raw.articles || [],
  config,
  targetDate
});
filtered.targetDate = targetDate;

const filteredPath = path.join(paths.dataDir, `${targetDate}.filtered.json`);
await writeJson(filteredPath, filtered);

console.log(`Saved AI review: ${filteredPath}`);
console.log(`Reviewed ${filtered.stats.reviewed ?? filtered.stats.total} articles. Kept ${filtered.stats.kept}.`);
