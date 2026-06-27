import { loadConfig } from "./lib/config.mjs";

export async function checkUrl(label, url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(10000)
    });
    return {
      label,
      url,
      ok: true,
      status: response.status,
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      label,
      url,
      ok: false,
      error: error.message,
      elapsedMs: Date.now() - startedAt
    };
  }
}

const config = await loadConfig();
const targets = [
  ["Portal", config.portal.baseUrl],
  ["Auth", "https://auth.bupt.edu.cn/authserver/login"]
];

let failed = false;
for (const [label, url] of targets) {
  const result = await checkUrl(label, url);
  if (result.ok) {
    console.log(`${label}: reachable (${result.status}, ${result.elapsedMs}ms) ${url}`);
  } else {
    failed = true;
    console.error(`${label}: unreachable (${result.elapsedMs}ms) ${url}`);
    console.error(`  ${result.error}`);
  }
}

if (failed) {
  console.error("Network check failed. Connect the campus network or BUPT VPN, then rerun `npm run netcheck`.");
  process.exitCode = 2;
}
