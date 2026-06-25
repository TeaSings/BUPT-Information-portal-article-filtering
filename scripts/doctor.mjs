import fs from "node:fs";
import { loadConfig } from "./lib/config.mjs";
import { resolveBrowserExecutable } from "./lib/browser.mjs";
import { pathExists } from "./lib/fs-utils.mjs";

const config = await loadConfig();

console.log("BUPT Portal Monitor doctor");
console.log(`Repo: ${config.runtime.repoRoot}`);
console.log(`Portal: ${config.portal.baseUrl}`);
console.log(`Browser: ${resolveBrowserExecutable(config)}`);
console.log(`Auth state: ${config.runtime.authStatePath}`);
console.log(`Auth state exists: ${await pathExists(config.runtime.authStatePath)}`);
console.log(`.env exists: ${fs.existsSync(`${config.runtime.repoRoot}/.env`)}`);
console.log(`SMTP host configured: ${Boolean(config.smtp.host)}`);
console.log(`SMTP user configured: ${Boolean(config.smtp.user)}`);
console.log(`SMTP password configured: ${Boolean(config.smtp.pass)}`);
console.log(`Mail recipient configured: ${Boolean(config.smtp.to)}`);
console.log(`DeepSeek base URL: ${config.deepseek.baseUrl}`);
console.log(`DeepSeek model: ${config.deepseek.model}`);
console.log(`DeepSeek API key configured: ${Boolean(config.deepseek.apiKey)}`);
console.log(`Daily queue dir: ${config.queue.dailyDir}`);
