import dotenv from "dotenv";
import { readJson } from "./fs-utils.mjs";
import { paths, resolveFromRoot } from "./paths.mjs";

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = deepMerge(base[key], value);
  }
  return result;
}

function envBool(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function envList(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value
    .split(/[,+]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function loadConfig() {
  dotenv.config({ path: paths.env, quiet: true });

  const base = await readJson(paths.config);
  if (!base) {
    throw new Error(`Missing config file: ${paths.config}`);
  }

  const local = await readJson(paths.localConfig, {});
  const config = deepMerge(base, local);

  config.runtime = {
    repoRoot: paths.repoRoot,
    authStatePath: resolveFromRoot(config.portal.authStatePath),
    browserExecutablePath:
      process.env.BROWSER_EXECUTABLE_PATH ||
      config.browserExecutablePath ||
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  };

  config.portalAuth = {
    username: process.env.BUPT_USERNAME || "",
    password: process.env.BUPT_PASSWORD || "",
    autoLogin: envBool("BUPT_AUTO_LOGIN", false),
    loginTimeoutMs: Number(process.env.BUPT_LOGIN_TIMEOUT_MS || 45000)
  };

  config.smtp = {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 465),
    secure: envBool("SMTP_SECURE", true),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || process.env.SMTP_USER || "",
    to: process.env.MAIL_TO || config.email.to || ""
  };

  config.deepseek = {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl: process.env.DEEPSEEK_BASE_URL || config.ai.baseUrl || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || config.ai.model || "deepseek-v4-pro",
    maxArticles: Number(process.env.AI_MAX_ARTICLES || config.ai.maxArticles || 80),
    maxContentChars: Number(process.env.AI_MAX_CONTENT_CHARS || config.ai.maxContentChars || 2600),
    maxImageOcrChars: Number(process.env.AI_MAX_IMAGE_OCR_CHARS || config.ai.maxImageOcrChars || 1800),
    temperature: Number(process.env.AI_TEMPERATURE || config.ai.temperature || 0.2),
    thinking: process.env.DEEPSEEK_THINKING || config.ai.thinking || "enabled",
    reasoningEffort: process.env.DEEPSEEK_REASONING_EFFORT || config.ai.reasoningEffort || "high",
    promptPath: resolveFromRoot(config.ai.promptPath || "prompts/daily-ai-summary.md")
  };

  config.ocr = {
    enabled: envBool("OCR_ENABLED", config.ocr?.enabled ?? true),
    languages: envList("OCR_LANGUAGES", config.ocr?.languages || ["chi_sim", "eng"]),
    cacheDir: resolveFromRoot(process.env.OCR_CACHE_DIR || config.ocr?.cacheDir || "data/ocr-cache")
  };

  return config;
}
