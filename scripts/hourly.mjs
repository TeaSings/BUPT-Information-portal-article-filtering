import { spawn } from "node:child_process";
import { hasFlag, parseArgs } from "./lib/args.mjs";
import { loadConfig } from "./lib/config.mjs";
import { assertYmd, getTargetDate } from "./lib/date-utils.mjs";
import { isReachable } from "./lib/network.mjs";
import {
  processPendingQueue,
  queueDeliveryStatus,
  queueStatusForDate,
  requeueIfMissingRecipients,
  retryFailedQueue
} from "./lib/queue.mjs";

function runNpmScript(name, extraArgs = []) {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", name, "--", ...extraArgs], {
      stdio: "inherit"
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

const args = parseArgs();
const config = await loadConfig();
const targetDate = getTargetDate(args, config);
assertYmd(targetDate);

const portalReachability = await isReachable(config.portal.baseUrl);
if (!portalReachability.ok) {
  console.error(`VPN_REQUIRED: cannot reach ${config.portal.baseUrl}. Keep BUPT VPN/aTrust online, then rerun npm run hourly.`);
  console.error(`  ${portalReachability.error}`);
  process.exit(4);
}

const status = await queueStatusForDate(config, targetDate);
if (status === "sent") {
  const delivery = await requeueIfMissingRecipients(config, targetDate);
  if (!delivery.requeued) {
    console.log(`HOURLY_DONE: ${targetDate} daily report was already sent to all current recipients.`);
    process.exit(0);
  }
  console.log(`HOURLY_RECIPIENTS: ${targetDate} report is missing ${delivery.missing.length} current recipient(s).`);
}

if (status === "failed") {
  const moved = await retryFailedQueue(config);
  console.log(`HOURLY_RETRY: moved ${moved} failed job(s) back to pending.`);
}

if (status === "pending" || status === "failed") {
  const results = await processPendingQueue(config, { stopOnFailure: true });
  if (results.some((result) => result.ok && result.targetDate === targetDate)) {
    console.log(`HOURLY_SENT: ${targetDate} pending report was sent.`);
    process.exit(0);
  }
  if (results.some((result) => !result.ok)) {
    console.error(`HOURLY_FAILED: ${targetDate} pending report could not be sent.`);
    process.exit(3);
  }
}

const delivery = await queueDeliveryStatus(config, targetDate);
if (delivery.status === "pending") {
  const results = await processPendingQueue(config, { stopOnFailure: true });
  if (results.some((result) => result.ok && result.targetDate === targetDate)) {
    console.log(`HOURLY_SENT: ${targetDate} missing recipient(s) were sent.`);
    process.exit(0);
  }
  if (results.some((result) => !result.ok)) {
    console.error(`HOURLY_FAILED: ${targetDate} missing recipient(s) could not be sent.`);
    process.exit(3);
  }
}

const dailyArgs = [
  ...(args.date ? ["--date", targetDate] : []),
  ...(hasFlag(args, "no-send") ? ["--no-send"] : [])
];
const code = await runNpmScript("daily", dailyArgs);
if (code === 2) {
  if (config.portalAuth.autoLogin) {
    console.log("HOURLY_LOGIN: portal login state expired; trying headless login.");
    const loginCode = await runNpmScript("login:auto", []);
    if (loginCode === 0) {
      const retryCode = await runNpmScript("daily", dailyArgs);
      process.exit(retryCode);
    }
  }
  console.error("LOGIN_REQUIRED: portal login state expired. Run `npm run login`, then rerun `npm run hourly`.");
}
process.exit(code);
