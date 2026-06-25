import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(
  fileURLToPath(new URL("../../", import.meta.url))
);

export const paths = {
  repoRoot,
  config: path.join(repoRoot, "config", "monitor.config.json"),
  localConfig: path.join(repoRoot, "config", "monitor.config.local.json"),
  env: path.join(repoRoot, ".env"),
  stateDir: path.join(repoRoot, "state"),
  dataDir: path.join(repoRoot, "data"),
  reportsDir: path.join(repoRoot, "reports"),
  dailyDir: path.join(repoRoot, "daily")
};

export function fromRoot(...parts) {
  return path.join(repoRoot, ...parts);
}

export function resolveFromRoot(relativeOrAbsolutePath) {
  if (path.isAbsolute(relativeOrAbsolutePath)) return relativeOrAbsolutePath;
  return path.join(repoRoot, relativeOrAbsolutePath);
}
