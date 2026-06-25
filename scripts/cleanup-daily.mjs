import { parseArgs, hasFlag } from "./lib/args.mjs";
import { loadConfig } from "./lib/config.mjs";
import { cleanupDailyQueue } from "./lib/queue.mjs";

const args = parseArgs();
const config = await loadConfig();
const cleaned = await cleanupDailyQueue(config, {
  dryRun: hasFlag(args, "dry-run")
});

if (!cleaned.length) {
  console.log("No old daily queue files to clean.");
} else {
  for (const item of cleaned) {
    console.log(`${hasFlag(args, "dry-run") ? "Would remove" : "Removed"} ${item.status}/${item.targetDate}`);
  }
}
