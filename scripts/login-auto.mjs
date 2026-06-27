import path from "node:path";
import { parseArgs, hasFlag } from "./lib/args.mjs";
import { loadConfig } from "./lib/config.mjs";
import { launchBrowser } from "./lib/browser.mjs";
import { ensureDir } from "./lib/fs-utils.mjs";

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function detectLogin(page) {
  const url = page.url().toLowerCase();
  const hasPassword = await page.locator("input[type='password']").count().catch(() => 0);
  if (hasPassword > 0) return true;
  if (url.includes("login") || url.includes("cas") || url.includes("authserver")) return true;

  const text = cleanText(await page.locator("body").innerText({ timeout: 3000 }).catch(() => ""));
  return /统一身份认证|账号登录|用户登录|请输入.*密码/.test(text);
}

async function firstUsableLocator(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (!count) continue;
    const visible = await locator.isVisible({ timeout: 1000 }).catch(() => false);
    const enabled = await locator.isEnabled({ timeout: 1000 }).catch(() => false);
    if (visible && enabled) return locator;
  }
  return null;
}

async function activatePasswordLogin(root) {
  const tab = root.getByText("密码登录", { exact: true }).first();
  if (await tab.isVisible({ timeout: 1000 }).catch(() => false)) {
    await tab.click();
    await root.page?.().waitForTimeout(500).catch(() => {});
  }
}

async function findUsernameInput(root) {
  return firstUsableLocator(root, [
    "input#username",
    "input[name='username']",
    "input[name='userName']",
    "input[name='userid']",
    "input[name='account']",
    "input[name='user']",
    "input[id*='user' i]",
    "input[name*='user' i]",
    "input[placeholder*='账号']",
    "input[placeholder*='学号']",
    "input[placeholder*='用户名']",
    "input[type='text']"
  ]);
}

async function findPasswordInput(root) {
  return firstUsableLocator(root, [
    "input#password",
    "input[name='password']",
    "input[name='pwd']",
    "input[id*='pass' i]",
    "input[name*='pass' i]",
    "input[placeholder*='密码']",
    "input[type='password']"
  ]);
}

async function findLoginForm(page) {
  const roots = [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
  for (const root of roots) {
    await activatePasswordLogin(root);
    const usernameInput = await findUsernameInput(root);
    const passwordInput = await findPasswordInput(root);
    if (usernameInput && passwordInput) return { root, usernameInput, passwordInput };
  }
  return null;
}

async function clickSubmit(root, passwordInput) {
  const roleButton = root.getByRole("button", { name: /登录|登陆|Login|Sign in/i }).first();
  if (await roleButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await roleButton.click();
    return;
  }

  const submit = await firstUsableLocator(root, [
    "button[type='submit']",
    "input[type='submit']",
    "input[type='button'][value*='登录']",
    "input[type='button'][value*='登陆']",
    ".login-btn",
    ".login_btn",
    ".auth_login_btn",
    ".submit-btn",
    "button:has-text('登录')",
    "button:has-text('登陆')",
    "a:has-text('登录')",
    "a:has-text('登陆')"
  ]);
  if (submit) {
    await submit.click();
    return;
  }

  await passwordInput.press("Enter");
}

async function waitForLoginSuccess(page, config) {
  const deadline = Date.now() + config.portalAuth.loginTimeoutMs;
  while (Date.now() < deadline) {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    if (!(await detectLogin(page))) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

function isRetryableNavigationError(error) {
  const message = String(error?.message || "");
  return /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_TIMED_OUT|ERR_NETWORK_CHANGED|Timeout/i.test(message);
}

async function openPortalWithRetry(page, config, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(config.portal.baseUrl, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableNavigationError(error)) throw error;

      const delayMs = attempt * 5000;
      console.warn(
        `Portal navigation failed on attempt ${attempt}/${attempts}; retrying in ${delayMs / 1000}s. ${error.message}`
      );
      await page.waitForTimeout(delayMs);
    }
  }
  throw lastError;
}

const args = parseArgs();
const config = await loadConfig();

if (!config.portalAuth.username || !config.portalAuth.password) {
  throw new Error("Missing BUPT_USERNAME or BUPT_PASSWORD in .env.");
}

const browser = await launchBrowser(config, {
  headless: hasFlag(args, "headful") ? false : true
});
const context = await browser.newContext({
  locale: "zh-CN",
  timezoneId: config.portal.timezone,
  viewport: { width: 1365, height: 900 }
});
const page = await context.newPage();
page.setDefaultTimeout(config.portalAuth.loginTimeoutMs);

try {
  console.log("Opening BUPT portal for automatic login.");
  await openPortalWithRetry(page, config);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  if (!(await detectLogin(page))) {
    console.log("Portal is already logged in; saving auth state.");
  } else {
    const form = await findLoginForm(page);
    if (!form) {
      throw new Error("Could not find username or password input on the BUPT login page.");
    }

    const { root, usernameInput, passwordInput } = form;
    await usernameInput.fill(config.portalAuth.username);
    await passwordInput.fill(config.portalAuth.password);
    await clickSubmit(root, passwordInput);

    const ok = await waitForLoginSuccess(page, config);
    if (!ok) {
      throw new Error("Automatic BUPT login did not reach a logged-in portal page before timeout.");
    }
  }

  await ensureDir(path.dirname(config.runtime.authStatePath));
  await context.storageState({ path: config.runtime.authStatePath });
  console.log(`Saved login state: ${config.runtime.authStatePath}`);
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
