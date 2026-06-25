import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { loadConfig } from "./lib/config.mjs";
import { launchBrowser } from "./lib/browser.mjs";
import { ensureDir } from "./lib/fs-utils.mjs";

const config = await loadConfig();
const browser = await launchBrowser(config, { headless: false });
const context = await browser.newContext({
  locale: "zh-CN",
  timezoneId: config.portal.timezone,
  viewport: { width: 1365, height: 900 }
});
const page = await context.newPage();

console.log("Opening BUPT portal. Log in manually in the browser window.");
await page.goto(config.portal.baseUrl, { waitUntil: "domcontentloaded" });

const rl = readline.createInterface({ input, output });
await rl.question("After the portal home page is fully logged in, press Enter here to save auth state...");
rl.close();

await ensureDir(path.dirname(config.runtime.authStatePath));
await context.storageState({ path: config.runtime.authStatePath });
console.log(`Saved login state: ${config.runtime.authStatePath}`);

await context.close();
await browser.close();
