// utils/syncProgress.mjs
// Simple in-memory job tracker for sync tasks.

const jobs = new Map(); // jobId -> job

function mkJobId(type, projectId) {
  return `${type}:${projectId}:${Date.now()}`;
}

export function startJob({ type, projectId, meta = {} }) {
  const jobId = mkJobId(type, projectId);
  const now = new Date();
  const job = {
    jobId,
    type,                 // "full" | "incremental"
    projectId,
    status: "running",    // running | done | failed
    phase: "starting",    // starting | query | upsert | finalizing
    fetched: 0,
    total: null,
    processed: 0,         // rows upserted so far
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    durationMs: null,
    lastMessage: null,
    error: null,
    ...meta,
  };
  jobs.set(jobId, job);
  return jobId;
}

export function updateJob(jobId, patch = {}) {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: new Date() });
}

export function completeJob(jobId, extra = {}) {
  const job = jobs.get(jobId);
  if (!job) return null;
  job.status = "done";
  job.phase = "finalizing";
  job.finishedAt = new Date();
  job.durationMs = job.finishedAt - job.startedAt;
  Object.assign(job, extra);
  jobs.set(jobId, job);
  return job;
}

export function failJob(jobId, error) {
  const job = jobs.get(jobId);
  if (!job) return null;
  job.status = "failed";
  job.phase = "finalizing";
  job.error = error?.message || String(error);
  job.finishedAt = new Date();
  job.durationMs = job.finishedAt - job.startedAt;
  jobs.set(jobId, job);
  return job;
}

export function getJob(jobId) {
  return jobs.get(jobId) || null;
}

export function listJobs() {
  return Array.from(jobs.values()).sort((a, b) => b.startedAt - a.startedAt);
}
