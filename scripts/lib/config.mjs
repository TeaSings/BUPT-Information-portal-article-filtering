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

  config.smtp = {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 465),
    secure: envBool("SMTP_SECURE", true),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || process.env.SMTP_USER || "",
    to: process.env.MAIL_TO || config.email.to || ""
  };

  return config;
}
