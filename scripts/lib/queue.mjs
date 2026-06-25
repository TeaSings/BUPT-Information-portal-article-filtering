import fs from "node:fs/promises";
import path from "node:path";
import { sendReportEmail } from "./email.mjs";
import { ensureDir, pathExists, readJson, writeJson } from "./fs-utils.mjs";
import { resolveFromRoot } from "./paths.mjs";

const statuses = ["pending", "sent", "failed"];

function queueRoot(config) {
  return resolveFromRoot(config.queue.dailyDir || "daily");
}

export function queueDir(config, status) {
  if (!statuses.includes(status)) {
    throw new Error(`Invalid queue status: ${status}`);
  }
  return path.join(queueRoot(config), status);
}

export function queueJobPath(config, status, targetDate) {
  return path.join(queueDir(config, status), `${targetDate}.json`);
}

export async function ensureQueueDirs(config) {
  await Promise.all(statuses.map((status) => ensureDir(queueDir(config, status))));
}

export async function queueStatusForDate(config, targetDate) {
  for (const status of statuses) {
    if (await pathExists(queueJobPath(config, status, targetDate))) return status;
  }
  return null;
}

export async function enqueueDailyReport({
  config,
  targetDate,
  filtered,
  markdown,
  html,
  reportPaths,
  force = false
}) {
  await ensureQueueDirs(config);
  const existingStatus = await queueStatusForDate(config, targetDate);
  if (existingStatus && !force) {
    return {
      enqueued: false,
      status: existingStatus,
      path: queueJobPath(config, existingStatus, targetDate)
    };
  }

  if (force && existingStatus) {
    await fs.rm(queueJobPath(config, existingStatus, targetDate), { force: true });
  }

  const job = {
    version: 1,
    targetDate,
    createdAt: new Date().toISOString(),
    attempts: [],
    filtered,
    markdown,
    html,
    reportPaths
  };

  const pendingPath = queueJobPath(config, "pending", targetDate);
  await writeJson(pendingPath, job);
  return { enqueued: true, status: "pending", path: pendingPath };
}

async function listQueueFiles(config, status) {
  await ensureQueueDirs(config);
  const dir = queueDir(config, status);
  const files = await fs.readdir(dir);
  return files
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => path.join(dir, file));
}

export async function listQueueJobs(config, status) {
  const files = await listQueueFiles(config, status);
  const jobs = [];
  for (const file of files) {
    const job = await readJson(file);
    if (job) jobs.push({ file, job });
  }
  return jobs;
}

async function moveJob(config, fromStatus, toStatus, job, patch = {}) {
  const fromPath = queueJobPath(config, fromStatus, job.targetDate);
  const toPath = queueJobPath(config, toStatus, job.targetDate);
  const nextJob = {
    ...job,
    ...patch,
    status: toStatus,
    updatedAt: new Date().toISOString()
  };
  await writeJson(toPath, nextJob);
  await fs.rm(fromPath, { force: true });
  return toPath;
}

export async function processPendingQueue(config, options = {}) {
  await ensureQueueDirs(config);
  const pending = await listQueueJobs(config, "pending");
  const results = [];

  for (const { job } of pending) {
    const attempt = {
      startedAt: new Date().toISOString()
    };

    try {
      const info = await sendReportEmail({
        config,
        filtered: job.filtered,
        targetDate: job.targetDate,
        markdown: job.markdown,
        html: job.html
      });
      attempt.finishedAt = new Date().toISOString();
      attempt.ok = true;
      attempt.messageId = info.messageId;
      attempt.accepted = info.accepted;
      attempt.rejected = info.rejected;

      const sentPath = await moveJob(config, "pending", "sent", job, {
        sentAt: attempt.finishedAt,
        attempts: [...(job.attempts || []), attempt]
      });
      results.push({ ok: true, targetDate: job.targetDate, path: sentPath, messageId: info.messageId });
    } catch (error) {
      attempt.finishedAt = new Date().toISOString();
      attempt.ok = false;
      attempt.error = error.message;

      const failedPath = await moveJob(config, "pending", "failed", job, {
        failedAt: attempt.finishedAt,
        attempts: [...(job.attempts || []), attempt]
      });
      results.push({ ok: false, targetDate: job.targetDate, path: failedPath, error: error.message });
      if (options.stopOnFailure) break;
    }
  }

  return results;
}

export async function retryFailedQueue(config) {
  await ensureQueueDirs(config);
  const failed = await listQueueJobs(config, "failed");
  for (const { job } of failed) {
    await moveJob(config, "failed", "pending", job, {
      retriedAt: new Date().toISOString()
    });
  }
  return failed.length;
}

function ageDays(job, now = Date.now()) {
  const marker = job.sentAt || job.failedAt || job.updatedAt || job.createdAt;
  const timestamp = marker ? Date.parse(marker) : Number.NaN;
  if (!Number.isFinite(timestamp)) return 0;
  return (now - timestamp) / (24 * 60 * 60 * 1000);
}

export async function cleanupDailyQueue(config, options = {}) {
  await ensureQueueDirs(config);
  const retention = config.queue.retentionDays || {};
  const dryRun = Boolean(options.dryRun);
  const cleaned = [];

  for (const status of statuses) {
    const keepDays = Number(retention[status]);
    if (!Number.isFinite(keepDays) || keepDays <= 0) continue;

    const jobs = await listQueueJobs(config, status);
    for (const { file, job } of jobs) {
      if (ageDays(job) < keepDays) continue;
      cleaned.push({ status, targetDate: job.targetDate, file });
      if (!dryRun) await fs.rm(file, { force: true });
    }
  }

  return cleaned;
}
