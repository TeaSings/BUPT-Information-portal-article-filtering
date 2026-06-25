import { parseArgs, hasFlag } from "./lib/args.mjs";
import { loadConfig } from "./lib/config.mjs";
import { processPendingQueue, retryFailedQueue } from "./lib/queue.mjs";

const args = parseArgs();
const config = await loadConfig();

if (hasFlag(args, "retry-failed")) {
  const moved = await retryFailedQueue(config);
  console.log(`Moved ${moved} failed job(s) back to pending.`);
}

const results = await processPendingQueue(config, {
  stopOnFailure: hasFlag(args, "stop-on-failure")
});

if (!results.length) {
  console.log("No pending daily email jobs.");
} else {
  for (const result of results) {
    if (result.ok) {
      console.log(`Sent ${result.targetDate}: ${result.messageId}`);
    } else {
      console.error(`Failed ${result.targetDate}: ${result.error}`);
    }
  }
}

if (results.some((result) => !result.ok)) {
  process.exitCode = 3;
}
