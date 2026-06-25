import fs from "node:fs";
import { chromium } from "playwright-core";

const browserCandidates = [
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
];

export function resolveBrowserExecutable(config) {
  const configured = config.runtime.browserExecutablePath;
  const candidates = [configured, ...browserCandidates].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `No Chromium-based browser found. Set BROWSER_EXECUTABLE_PATH in .env. Tried: ${candidates.join(", ")}`
    );
  }
  return found;
}

export async function launchBrowser(config, options = {}) {
  const executablePath = resolveBrowserExecutable(config);
  const headless = options.headless ?? config.crawler.headless ?? true;
  return chromium.launch({
    executablePath,
    headless,
    args: ["--disable-blink-features=AutomationControlled"]
  });
}
