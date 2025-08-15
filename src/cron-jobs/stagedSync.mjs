// src/cron-jobs/stagedSync.mjs
import { Op, fn, col, Sequelize } from "sequelize";
import sequelize from "../config/db.mjs";

import HouseholdOutbox from "../models/householdOutbox.model.mjs";
import ParticipantOutbox from "../models/participantOutbox.model.mjs";
import AttendanceOutbox from "../models/attendanceOutbox.model.mjs";
import UploadRun from "../models/uploadRun.model.mjs";

import { ParticipantSyncService } from "../services/participantSync.service.mjs";
import { AttendanceSyncService } from "../services/attendanceSync.service.mjs";
import Projects from "../models/projects.models.mjs";

import cron from "node-cron";

/* --------------------------------- config -------------------------------- */
const BATCH_SIZE_DB = 100; // rows we claim from PG at once
const BATCH_SIZE_SF = 200; // rows we send to Salesforce per call
const MAX_ATTEMPTS = 5;

const ACTIVE_STATES = ["pending", "processing"];
const ERROR_STATES = ["failed", "dead"];

/* ------------------------------ util helpers ----------------------------- */
const now = () => new Date();

async function resolveRunId(projectId, runId) {
  if (runId) return runId;
  const run = await UploadRun.findOne({
    where: { projectId, status: { [Op.in]: ["running"] } },
    order: [["createdAt", "DESC"]],
    raw: true,
  });
  return run?.id || null;
}

async function markRun(runId, patch) {
  if (!runId) return;
  await UploadRun.update(patch, { where: { id: runId } });
}


function sanitizeSObjectPayload(payload) {
  const out = {};
  for (const [k, v] of Object.entries(payload || {})) {
    if (k.startsWith("__")) continue; // drop internal hints
    out[k] = v;
  }
  return out;
}

/** Aggregate counts for progress/finalization */
async function countsFor(model, projectId) {
  const rows = await model.findAll({
    attributes: ["status", [fn("COUNT", col("id")), "n"]],
    where: { projectId },
    group: ["status"],
    raw: true,
  });
  const out = { pending: 0, processing: 0, sent: 0, failed: 0, dead: 0 };
  rows.forEach((r) => {
    out[r.status] = Number(r.n) || 0;
  });
  out.total = out.pending + out.processing + out.sent + out.failed + out.dead;
  return out;
}

async function aggregateAll(projectId) {
  const [hh, parts, att] = await Promise.all([
    countsFor(HouseholdOutbox, projectId),
    countsFor(ParticipantOutbox, projectId),
    countsFor(AttendanceOutbox, projectId),
  ]);
  const sum = (k) => hh[k] + parts[k] + att[k];
  return {
    byQueue: { households: hh, participants: parts, attendance: att },
    totals: {
      pending: sum("pending"),
      processing: sum("processing"),
      sent: sum("sent"),
      failed: sum("failed"),
      dead: sum("dead"),
      total: sum("total"),
    },
  };
}

/** Claim a batch atomically: set status->processing & attempts+1, return rows */
async function claimBatch(model, projectId, limit = BATCH_SIZE_DB) {
  return await sequelize.transaction(
    { isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED },
    async (t) => {
      // Lock & pick rows
      const rows = await model.findAll({
        where: { projectId, status: "pending" },
        order: [["createdAt", "ASC"]],
        limit,
        lock: t.LOCK.UPDATE,
        skipLocked: true,
        transaction: t,
      });

      if (!rows.length) return [];

      // Mark as processing + attempts++
      const ids = rows.map((r) => r.id);
      await model.update(
        {
          status: "processing",
          attempts: sequelize.literal(`attempts + 1`),
          updatedAt: now(),
        },
        { where: { id: ids }, transaction: t }
      );

      // Re-read fresh values (optional) or just return original rows
      return await model.findAll({ where: { id: ids }, transaction: t });
    }
  );
}

/** Chunk helper */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** status setter after push */
async function finishRows(model, successRows, errorRows) {
  if (successRows.length) {
    await model.update(
      { status: "sent", lastError: null, updatedAt: now() },
      { where: { id: successRows } }
    );
  }
  if (errorRows.length) {
    // decide failed vs dead by attempts
    const badOnes = await model.findAll({
      where: { id: errorRows },
      raw: true,
    });
    const toDead = badOnes
      .filter((r) => (r.attempts ?? 0) >= MAX_ATTEMPTS)
      .map((r) => r.id);
    const toFailed = badOnes
      .filter((r) => !(r.attempts >= MAX_ATTEMPTS))
      .map((r) => r.id);

    if (toFailed.length) {
      await model.update(
        { status: "failed", updatedAt: now() },
        { where: { id: toFailed } }
      );
    }
    if (toDead.length) {
      await model.update(
        { status: "dead", updatedAt: now() },
        { where: { id: toDead } }
      );
    }
  }
}

/* ---------------------------- SF push helpers ---------------------------- */
/** Push Household__c */
async function pushHouseholdChunk(sf_conn, rows) {
  // split into create / update
  const createPayload = [];
  const updatePayload = [];
  rows.forEach((r) => {
    const p = sanitizeSObjectPayload(r.payload || {});
    if (p.Id) updatePayload.push({ ...p, __rowId: r.id });
    else createPayload.push({ ...p, __rowId: r.id });
  });

  const successes = new Set();
  const failures = new Map(); // id -> message

  const handleResult = (records, results) => {
    results.forEach((res, i) => {
      const rowId = records[i].__rowId; // we add below
      if (res && res.success) successes.add(rowId);
      else failures.set(rowId, res?.errors?.[0]?.message || "Unknown SF error");
    });
  };

  // Attach row id for mapping back
  createPayload.forEach((p, i) => {
    p.__rowId = rows.filter((r) => !r.payload?.Id)[i].id;
  });
  updatePayload.forEach((p, i) => {
    p.__rowId = rows.filter((r) => r.payload?.Id)[i].id;
  });

  try {
    if (createPayload.length) {
      const results = await sf_conn
        .sobject("Household__c")
        .create(createPayload.map(({ __rowId, ...rest }) => rest));
      handleResult(createPayload, results);
    }
    if (updatePayload.length) {
      const results = await sf_conn
        .sobject("Household__c")
        .update(updatePayload.map(({ __rowId, ...rest }) => rest));
      handleResult(updatePayload, results);
    }
  } catch (e) {
    // Entire chunk failed → mark all as failed with same message
    rows.forEach((r) => failures.set(r.id, e?.message || String(e)));
  }

  return { successes, failures };
}

/** Push Participant__c */
async function pushParticipantChunk(sf_conn, rows) {
  const createPayload = [];
  const updatePayload = [];

  rows.forEach((r) => {
    // add flags, then sanitize to remove __resolverHints
    const withFlags = {
      ...(r.payload || {}),
      Resend_to_OpenFN__c: true,
      Create_In_CommCare__c: false,
      Check_Status__c: true,
    };
    const p = sanitizeSObjectPayload(withFlags);

    if (p.Id) updatePayload.push({ ...p, __rowId: r.id });
    else createPayload.push({ ...p, __rowId: r.id });
  });

  const successes = new Set();
  const failures = new Map();

  const handleResult = (records, results) => {
    results.forEach((res, i) => {
      const rowId = records[i].__rowId;
      if (res && res.success) successes.add(rowId);
      else failures.set(rowId, res?.errors?.[0]?.message || "Unknown SF error");
    });
  };

  createPayload.forEach((p, i) => {
    p.__rowId = rows.filter((r) => !r.payload?.Id)[i].id;
  });
  updatePayload.forEach((p, i) => {
    p.__rowId = rows.filter((r) => r.payload?.Id)[i].id;
  });

  try {
    if (createPayload.length) {
      const results = await sf_conn
        .sobject("Participant__c")
        .create(createPayload.map(({ __rowId, ...rest }) => rest));
      handleResult(createPayload, results);
    }
    if (updatePayload.length) {
      const results = await sf_conn
        .sobject("Participant__c")
        .update(updatePayload.map(({ __rowId, ...rest }) => rest));
      handleResult(updatePayload, results);
    }
  } catch (e) {
    rows.forEach((r) => failures.set(r.id, e?.message || String(e)));
  }

  return { successes, failures };
}

/** Resolve Participant__c by TNS id if needed */
async function resolveParticipantId(sf_conn, row) {
  if (row.participantSalesforceId) return row.participantSalesforceId;
  if (!row.participantTnsId) return null;
  const q = await sf_conn.query(
    `SELECT Id FROM Participant__c WHERE TNS_Id__c = '${row.participantTnsId.replace(
      /'/g,
      "''"
    )}' LIMIT 1`
  );
  return q.records?.[0]?.Id || null;
}

/** Resolve Training_Session__c from ffgId + moduleId */
async function resolveTrainingSessionId(sf_conn, ffgId, moduleId) {
  const tgQ = await sf_conn.query(
    `SELECT Id FROM Training_Group__c WHERE TNS_Id__c = '${String(
      ffgId
    ).replace(/'/g, "''")}' LIMIT 1`
  );
  const tgId = tgQ.records?.[0]?.Id;
  if (!tgId) return null;

  const tsQ = await sf_conn.query(
    `SELECT Id FROM Training_Session__c WHERE Training_Group__c = '${tgId}' AND Training_Module__c = '${String(
      moduleId
    ).replace(/'/g, "''")}' LIMIT 1`
  );
  return tsQ.records?.[0]?.Id || null;
}

/** Push Attendance__c */
async function pushAttendanceChunk(sf_conn, rows) {
  const records = [];
  const idMap = []; // row.id order aligned with records

  // build records (resolve dependent ids)
  for (const r of rows) {
    try {
      const participantId = await resolveParticipantId(sf_conn, r);
      const sessionId = await resolveTrainingSessionId(
        sf_conn,
        r.ffgId,
        r.moduleId
      );

      if (!participantId)
        throw new Error(
          "Participant__c not found from participantSalesforceId/participantTnsId"
        );
      if (!sessionId)
        throw new Error(
          `Training_Session__c not found for ffgId=${r.ffgId} & moduleId=${r.moduleId}`
        );

      const s = r.attended ? "Present" : "Absent";
      const raw = {
        ...(r.payload || {}),
        Status__c: s,
        Participant__c: participantId,
        Training_Session__c: sessionId,
      };

      const payload = sanitizeSObjectPayload(raw); 
      // If has Id → update; else create
      if (payload.Id) records.push(payload);
      else records.push(payload); // create path; same structure
      idMap.push(r.id);
    } catch (e) {
      // pre-validation failure; leave to caller as immediate failure
      // mark with sentinel so we can assign error
      records.push({ __error: e.message });
      idMap.push(r.id);
    }
  }

  const successes = new Set();
  const failures = new Map();

  // Split into immediate failures vs candidates
  const ready = [];
  const readyIds = [];
  records.forEach((rec, i) => {
    if (rec.__error) failures.set(idMap[i], rec.__error);
    else {
      ready.push(rec);
      readyIds.push(idMap[i]);
    }
  });

  if (ready.length === 0) return { successes, failures };

  // Separate create/update
  const toCreate = [];
  const toUpdate = [];
  ready.forEach((r, i) =>
    r.Id ? toUpdate.push({ rec: r, i }) : toCreate.push({ rec: r, i })
  );

  const handle = (list, results) => {
    results.forEach((res, j) => {
      const idx = list[j].i;
      const rowId = readyIds[idx];
      if (res && res.success) successes.add(rowId);
      else failures.set(rowId, res?.errors?.[0]?.message || "Unknown SF error");
    });
  };

  try {
    if (toCreate.length) {
      const r = await sf_conn
        .sobject("Attendance__c")
        .create(toCreate.map((x) => x.rec));
      handle(toCreate, r);
    }
    if (toUpdate.length) {
      const r = await sf_conn
        .sobject("Attendance__c")
        .update(toUpdate.map((x) => x.rec));
      handle(toUpdate, r);
    }
  } catch (e) {
    readyIds.forEach((id) => failures.set(id, e?.message || String(e)));
  }

  return { successes, failures };
}

/* --------------------------- phase drainers (DB) -------------------------- */
async function drainQueue({ model, projectId, sf_conn, label, pushChunkFn }) {
  for (;;) {
    // Are there any active left?
    const remaining = await model.count({
      where: { projectId, status: { [Op.in]: ACTIVE_STATES } },
    });
    if (remaining === 0) break;

    // Claim a batch → processing
    const claimed = await claimBatch(model, projectId, BATCH_SIZE_DB);
    if (!claimed.length) break;

    console.log(`[${projectId}] ${label}: pushing ${claimed.length}`);

    // Push to SF in sub-chunks up to 200
    const chunks = chunk(claimed, BATCH_SIZE_SF);
    for (const rows of chunks) {
      const { successes, failures } = await pushChunkFn(sf_conn, rows);

      // Persist lastError on failures
      for (const [rowId, message] of failures.entries()) {
        await model.update(
          { lastError: String(message), updatedAt: now() },
          { where: { id: rowId } }
        );
      }

      // Flip statuses
      await finishRows(
        model,
        Array.from(successes),
        Array.from(failures.keys())
      );
    }
  }
}

/* ----------------------------- public runner ------------------------------ */
/**
 * Orchestrates: Households → Participants → Attendance
 * After parts → ParticipantSyncService.syncIncremental
 * After attendance → AttendanceSyncService.syncFromSalesforce
 * At end → mark UploadRun completed or completed_with_errors
 */
export async function runSequentialOutboxPush(
  projectId,
  sf_conn,
  { runId = null } = {}
) {
  const resolvedRunId = await resolveRunId(projectId, runId);
  await markRun(resolvedRunId, { status: "running", startedAt: now() });

  console.log(`[${projectId}] Outbox push started…`);

  // 1) Households
  await drainQueue({
    model: HouseholdOutbox,
    projectId,
    sf_conn,
    label: "Households",
    pushChunkFn: pushHouseholdChunk,
  });

  // 2) Participants
  await drainQueue({
    model: ParticipantOutbox,
    projectId,
    sf_conn,
    label: "Participants",
    pushChunkFn: pushParticipantChunk,
  });

  // Post-push participant refresh
  try {
    await ParticipantSyncService.syncIncremental(sf_conn, projectId);
    console.log(`[${projectId}] Participant incremental sync done.`);
  } catch (e) {
    console.error(
      `[${projectId}] Participant incremental sync failed:`,
      e?.message || e
    );

    console.log(e);
  }

  // 3) Attendance
  await drainQueue({
    model: AttendanceOutbox,
    projectId,
    sf_conn,
    label: "Attendance",
    pushChunkFn: pushAttendanceChunk,
  });

  // Post-push attendance refresh
  try {
    await AttendanceSyncService.syncFromSalesforce(projectId, sf_conn);
    console.log(`[${projectId}] Attendance backfill sync done.`);
  } catch (e) {
    console.error(
      `[${projectId}] Attendance backfill sync failed:`,
      e?.message || e
    );
  }

  // Finalize run state
  const { totals } = await aggregateAll(projectId);
  const anyActive = totals.pending + totals.processing > 0;
  const anyErrors = totals.failed + totals.dead > 0;
  const finalStatus = !anyActive && !anyErrors ? "completed" : "running";

  await markRun(resolvedRunId, {
    status: finalStatus,
    finishedAt: now(),
    meta: JSON.stringify({ totals }),
  });

  console.log(`[${projectId}] Outbox push finished. Final: ${finalStatus}`);

  return { finalStatus, totals };
}

/* ------------------------------- convenience ------------------------------ */
/**
 * Optional top-level function you can call from a route/cron:
 *    await runOutboxForProject(projectId, sf_conn)
 */
export async function runOutboxForProject(projectId, sf_conn) {
  return runSequentialOutboxPush(projectId, sf_conn);
}

export async function runPartSyncCrons(sf_conn) {
  cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        const projects = await Projects.findAll({
          attributes: ["sf_project_id"],
          where: { attendance_full: true },
        });

        if (!projects || projects.length === 0) {
          console.log("No active projects found for outbox push.");
          return;
        }

        for (const project of projects) {
          (async () => {
            try {
              await runSequentialOutboxPush(project.sf_project_id, sf_conn);
            } catch (err) {
              console.error(
                `[cron] push failed for project ${project.sf_project_id}:`,
                err?.message || err
              );
            }
          })();
        }
      } catch (err) {
        console.error("[cron] tick error:", err?.message || err);
      }
    },
    { scheduled: true }
  );
}
