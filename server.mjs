import express, { application } from "express";
import path from "path";
import dotenv from "dotenv";
import jsforce from "jsforce";
import { ApolloServer } from "apollo-server-express";
import { default as graphqlUploadExpress } from "graphql-upload/graphqlUploadExpress.mjs";
import LoginsTypeDefs from "./src/typeDefs/logins.typeDefs.mjs";
import LoginsResolvers from "./src/resolvers/logins.resolvers.mjs";
import ProjectsTypeDefs from "./src/typeDefs/projects.typeDefs.mjs";
import ProjectsResolvers from "./src/resolvers/projects.resolvers.mjs";
import PermissionsResolvers from "./src/resolvers/permissions.resolvers.mjs";
import PermissionsTypeDefs from "./src/typeDefs/permissions.typeDefs.mjs";
import RolesTypeDefs from "./src/typeDefs/roles.typeDefs.mjs";
import RolesResolvers from "./src/resolvers/roles.resolvers.mjs";
import usersTypeDefs from "./src/typeDefs/users.typeDefs.mjs";
import UsersResolvers from "./src/resolvers/users.resolvers.mjs";
import cron from "cron";
import cors from "cors";
import loadSFProjects from "./src/reusables/load_projects.mjs";
import Redis from "ioredis";
import { RedisPubSub } from "graphql-redis-subscriptions";
import {
  cacheTrainingGroups,
  cacheTrainingParticipants,
  cacheTrainingSessions,
} from "./src/utils/saveTrainingsCache.mjs";
import TrainingSessionsTypeDefs from "./src/typeDefs/training_sessions.typeDefs.mjs";
import TrainingSessionsResolvers from "./src/resolvers/training_sessions.resolvers.mjs";
import TrainingGroupsTypeDefs from "./src/typeDefs/training_groups.typeDefs.mjs";
import TrainingGroupsResolvers from "./src/resolvers/training_groups.resolvers.mjs";
import ProjectRoleTypeDefs from "./src/typeDefs/project_role.typeDefs.mjs";
import ProjectRoleResolvers from "./src/resolvers/project_role.resolvers.mjs";
import ParticipantsTypeDefs from "./src/typeDefs/participants.typeDefs.mjs";
import ParticipantsResolvers from "./src/resolvers/participants.resolvers.mjs";
import AttendanceTypeDefs from "./src/typeDefs/attendance.typeDefs.mjs";
import AttendanceResolvers from "./src/resolvers/attendance.resolvers.mjs";
import FarmVisitsTypeDefs from "./src/typeDefs/farm_visits.typeDefs.mjs";
import FarmVisitsResolvers from "./src/resolvers/farm_visits.resolvers.mjs";
import dashboardTypeDefs from "./src/typeDefs/wt_dashboard.typeDefs.mjs";
import { getDirName } from "./src/utils/getDirName.mjs";
import FVQAsTypeDefs from "./src/typeDefs/fv_qas.typeDefs.mjs";
import FVQAsResolvers from "./src/resolvers/fv_qas.resolvers.mjs";
import TrainingModulesTypeDefs from "./src/typeDefs/training_modules.typeDefs.mjs";
import TrainingModulesResolvers from "./src/resolvers/training_modules.resolvers.mjs";
import PerformanceResolvers from "./src/resolvers/performance.resolvers.mjs";
import PerformanceTypeDefs from "./src/typeDefs/performance.typeDefs.mjs";
import { FarmVisitService } from "./src/services/farmVisit.service.mjs";
import WetmillsResolvers from "./src/resolvers/wetmills.resolvers.mjs";
import wetmillsTypeDefs from "./src/typeDefs/wetmills.typeDefs.mjs";
import WetMillvisitsTypeDefs from "./src/typeDefs/wetmill_visits.typeDefs.mjs";
import WetMillVisitsResolvers from "./src/resolvers/wetmill_visits.resolvers.mjs";
import DashboardResolvers from "./src/resolvers/wt_dashboard.resolvers.mjs";
import axios from "axios";
import "./src/cron-jobs/attendance.cron.mjs";
import "./src/cron-jobs/farmVisit.cron.mjs";
import "./src/cron-jobs/syncParticipants.mjs";

import logger from "./src/config/logger.mjs";
import Projects from "./src/models/projects.models.mjs";
import { TSessionService } from "./src/services/tsessions.service.mjs";
import heicConvert from "heic-convert";
import fileType from "file-type";
import { AttendanceSyncService } from "./src/services/attendanceSync.service.mjs";
import { ParticipantSyncService } from "./src/services/participantSync.service.mjs";
import { listJobs } from "./src/utils/syncProgress.mjs";
import {
  runOutboxForProject,
  runPartSyncCrons,
  runSequentialOutboxPush
} from "./src/cron-jobs/stagedSync.mjs";

const app = express();

app.use(cors());

app.use(express.json());

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

const redis = new Redis({
  host: "127.0.0.1", // localhost
  port: 6379, // default Redis port
  retryStrategy: (times) => Math.min(times * 2, 2000), // retry connection if it fails
});

dotenv.config();

const PORT = process.env.PORT || 6500;

const creds = {
  username: process.env.SF_USERNAME,
  password: process.env.SF_PASSWORD,
  securityToken: process.env.SF_SECURITY_TOKEN,
  sf_url: process.env.SF_URL,
};

const uploadsDirectory = path.join(getDirName(import.meta.url), "uploads");

app.use("/uploads", express.static(uploadsDirectory));

app.use(graphqlUploadExpress());

var conn = new jsforce.Connection({
  // you can change loginUrl to connect to sandbox or prerelease env.
  loginUrl: creds.sf_url,
});

// Make a connection to salesforce
conn.login(
  creds.username,
  creds.password + creds.securityToken,
  function (err, userInfo) {
    if (err) {
      return console.error(err);
    }
    // Now you can get the access token and instance URL information.
    // Save them to establish a connection next time.
    console.log(conn.accessToken);
    console.log(conn.instanceUrl);
    // logged in user property
    console.log("User ID: " + userInfo.id);
    console.log("Org ID: " + userInfo.organizationId);
    console.log("Salesforce : JSForce Connection is established!");
  }
);

app.get("/api/sampling", (req, res) => {
  // kick off both jobs but don't await
  FarmVisitService.sampleFarmVisits(conn).catch((err) => logger.error(err));
  TSessionService.sampleTSForApprovals(conn).catch((err) => logger.error(err));

  // respond at once
  res.json({ success: true, message: "Sampling started" });
});

app.get("/api/mail", async (req, res) => {
  await FarmVisitService.sendRemainderEmail();
  await TSessionService.sendRemainderEmail();
  res.send("Done sending mails");
});

// --- PROGRESS INSPECTION ENDPOINTS ---

// All jobs (recent first)
app.get("/api/sync/progress", (req, res) => {
  res.json({ status: 200, jobs: listJobs() });
});

// Single job by id
app.get("/api/sync/progress/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job)
    return res.status(404).json({ status: 404, message: "Job not found" });
  res.json({ status: 200, job });
});

// GET /api/participants/sync/full
app.get("/api/participants/sync/full", async (req, res) => {
  try {
    const projects = await Projects.findAll({
      where: { attendance_full: true },
      attributes: ["sf_project_id"],
    });

    if (!projects.length) {
      return res.status(404).json({ message: "No active projects found." });
    }

    const projectIds = projects.map((p) => p.sf_project_id);

    const results = await Promise.allSettled(
      projectIds.map(async (projectId) => {
        const startedAt = Date.now();
        // lightweight console progress (optional)
        const onProgress = (p) => {
          if (p?.phase === "query" && p.total != null) {
            console.log(`[full] ${projectId}: fetched ${p.fetched}/${p.total}`);
          } else if (p?.phase === "upsert" && p.totalRows != null) {
            console.log(
              `[full] ${projectId}: upserted ${p.processed}/${p.totalRows}`
            );
          } else if (p?.message) {
            console.log(`[full] ${projectId}: ${p.message}`);
          }
        };

        await ParticipantSyncService.fullRefresh(conn, projectId, onProgress);
        const durationMs = Date.now() - startedAt;
        return { projectId, durationMs };
      })
    );

    const failures = results
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.status === "rejected");

    if (failures.length) {
      console.error(
        "Some projects failed to sync:",
        failures.map((f) => ({
          projectId: projectIds[f.i],
          error: f.r.reason?.message || String(f.r.reason),
        }))
      );
      return res.status(500).json({
        message: "Some projects failed to sync",
        failures: failures.map((f) => ({
          projectId: projectIds[f.i],
          error: f.r.reason?.message || String(f.r.reason),
        })),
      });
    }

    console.log("✅ Full participant sync complete for all projects");
    res.json({
      message: "Full participant sync completed successfully.",
      results: results.map((r, i) => ({
        projectId: projectIds[i],
        status: "ok",
        durationMs: r.value.durationMs,
      })),
    });
  } catch (err) {
    console.error("❌ Error in full participant sync:", err);
    res
      .status(500)
      .json({ message: "Error in full participant sync", error: err.message });
  }
});

// GET /api/participants/sync/incremental
app.get("/api/participants/sync/incremental", async (req, res) => {
  try {
    const projects = await Projects.findAll({
      where: { attendance_full: true },
      attributes: ["sf_project_id"],
    });

    if (!projects.length) {
      return res.status(404).json({ message: "No active projects found." });
    }

    const projectIds = projects.map((p) => p.sf_project_id);

    const results = await Promise.allSettled(
      projectIds.map(async (projectId) => {
        const startedAt = Date.now();
        const onProgress = (p) => {
          if (p?.phase === "query" && p.total != null) {
            console.log(
              `[incremental] ${projectId}: fetched ${p.fetched}/${p.total}`
            );
          } else if (p?.phase === "upsert" && p.totalRows != null) {
            console.log(
              `[incremental] ${projectId}: upserted ${p.processed}/${p.totalRows}`
            );
          } else if (p?.message) {
            console.log(`[incremental] ${projectId}: ${p.message}`);
          }
        };

        await ParticipantSyncService.syncIncremental(
          conn,
          projectId,
          onProgress
        );
        const durationMs = Date.now() - startedAt;
        return { projectId, durationMs };
      })
    );

    const failures = results
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.status === "rejected");

    if (failures.length) {
      console.error(
        "Some projects failed to sync:",
        failures.map((f) => ({
          projectId: projectIds[f.i],
          error: f.r.reason?.message || String(f.r.reason),
        }))
      );
      return res.status(500).json({
        message: "Some projects failed to sync",
        failures: failures.map((f) => ({
          projectId: projectIds[f.i],
          error: f.r.reason?.message || String(f.r.reason),
        })),
      });
    }

    console.log("✅ Incremental participant sync complete for all projects");
    res.json({
      message: "Incremental participant sync completed successfully.",
      results: results.map((r, i) => ({
        projectId: projectIds[i],
        status: "ok",
        durationMs: r.value.durationMs,
      })),
    });
  } catch (err) {
    console.error("❌ Error in incremental participant sync:", err);
    res.status(500).json({
      message: "Error in incremental participant sync",
      error: err.message,
    });
  }
});

app.get("/api/attendance/sync", async (req, res) => {
  try {
    const projects = await Projects.findAll({
      where: { attendance_full: true },
    });

    if (!projects.length) {
      return res.status(404).json({ message: "No active projects found." });
    }

    // Kick off all syncs in parallel
    const results = await Promise.allSettled(
      projects.map((p) =>
        AttendanceSyncService.syncFromSalesforce(p.sf_project_id, conn)
      )
    );

    // Check for failures
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length) {
      console.error("Some projects failed to sync:", failures);
      return res
        .status(500)
        .json({ message: "Some projects failed to sync", failures });
    }

    console.log("✅ All projects synced");
    res.json({ message: "Attendance sync completed successfully." });
  } catch (err) {
    console.error("❌ Error in SF→PG sync:", err);
    res
      .status(500)
      .json({ message: "Error in SF→PG sync", error: err.message });
  }
});

app.get("/api/sync/participantsToSalesforce", async (req, res) => {
  try {
    const projects = await Projects.findAll({
      where: { attendance_full: true },
      attributes: ["project_id", "sf_project_id"],
    });

    projects.forEach(async (p) => {
      console.log(`Pushing participants for project to salesforce ${p.sf_project_id}`);
      await runOutboxForProject(p.sf_project_id, conn);
      console.log(`✅ Participants pushed for project ${p.sf_project_id}`);
    });

    res.json({ message: "Participants pushed to Salesforce successfully." });
  } catch (err) {
    console.error("❌ Error pushing participants to Salesforce:", err);
    res.status(500).json({
      message: "Error pushing participants to Salesforce",
      error: err.message,
    });
  }
});

app.post("/api/outbox/retry", async (_req, res) => {
  try {
    const statuses = ["failed", "dead"];
    const QUEUE = {
      households: HouseholdOutbox,
      participants: ParticipantOutbox,
      attendance: AttendanceOutbox,
    };

    // Collect projects that currently have failed/dead rows
    const projects = new Set();
    for (const Model of Object.values(QUEUE)) {
      const rows = await Model.findAll({
        attributes: ["projectId"],
        where: { status: { [Op.in]: statuses } },
        group: ["projectId"],
        raw: true,
      });
      rows.forEach((r) => r.projectId && projects.add(r.projectId));
    }

    if (projects.size === 0) {
      return res.json({ status: 200, message: "Nothing to retry." });
    }

    // Flip ALL failed/dead to pending (across all projects/queues)
    const now = new Date();
    for (const Model of Object.values(QUEUE)) {
      await Model.update(
        { status: "pending", nextAttemptAt: now },
        { where: { status: { [Op.in]: statuses } } }
      );
    }

    // Kick the sequential pusher per affected project.
    for (const projectId of projects) {
      // Reuse an active run if one exists; otherwise create a new one.
      // const existingRun = await UploadRun.findOne({
      //   where: { projectId, status: "running" },
      //   order: [["createdAt", "DESC"]],
      // });

      // const run =
      //   existingRun ||
      //   (await UploadRun.create({
      //     projectId,
      //     status: "running",
      //     meta: { source: "manual-retry" },
      //   }));

      // Fire-and-forget; progress is reported by your existing progress API
      runSequentialOutboxPush(projectId, sf_conn, { runId: run.id }).catch(
        (e) => console.error(`[manual-retry] runner error ${projectId}:`, e)
      );
    }

    res.json({ status: 200, message: "Retry triggered." });
  } catch (err) {
    console.error("[POST /api/outbox/retry]", err);
    res.status(500).json({ error: "Retry failed." });
  }
});


// server.mjs (add near your other imports)
import { Op } from "sequelize";
import UploadRun from "./src/models/uploadRun.model.mjs";
import HouseholdOutbox from "./src/models/householdOutbox.model.mjs";
import ParticipantOutbox from "./src/models/participantOutbox.model.mjs";
import AttendanceOutbox from "./src/models/attendanceOutbox.model.mjs";

// helper: choose the most relevant run (prefer running; else latest)
async function pickLatestRun(projectId, explicitRunId) {
  if (explicitRunId) {
    const run = await UploadRun.findOne({
      where: { id: explicitRunId, projectId },
    });
    if (run) return run;
  }
  const running = await UploadRun.findOne({
    where: { projectId, status: "running" },
    order: [["created_at", "DESC"]],
  });
  if (running) return running;

  return UploadRun.findOne({
    where: { projectId },
    order: [["created_at", "DESC"]],
  });
}

// helper: build a WHERE that scopes rows to a run even if upload_run_id column
// is not present on the outbox table (fallback to createdAt window)
function scopeToRun(model, projectId, run) {
  const where = { projectId };
  const attrs = model.rawAttributes || {};

  if (run) {
    if (attrs.uploadRunId) {
      // preferred: hard link
      where.uploadRunId = run.id;
    } else if (attrs.createdAt) {
      // fallback: time window
      where.createdAt = {
        [Op.gte]: run.startedAt || run.createdAt,
        ...(run.finishedAt ? { [Op.lte]: run.finishedAt } : {}),
      };
    }
  }
  return where;
}

async function countsFor(model, where) {
  const [total, pending, processing, failed, sent] = await Promise.all([
    model.count({ where }),
    model.count({ where: { ...where, status: "pending" } }),
    model.count({ where: { ...where, status: "processing" } }),
    model.count({ where: { ...where, status: "failed" } }),
    model.count({ where: { ...where, status: "sent" } }),
  ]);
  const leftToSend = pending + processing; // for progress bar
  const percent = total ? Math.round((sent / total) * 100) : 0;
  return { total, pending, processing, failed, sent, leftToSend, percent };
}

async function failedRowsFor(model, where, type) {
  const rows = await model.findAll({
    where: { ...where, status: "failed" },
    order: [["updated_at", "DESC"]],
    limit: 200,
  });

  // project a compact, UI-friendly payload preview
  return rows.map((r) => {
    const base = {
      type,
      id: r.id,
      attempts: r.attempts,
      lastError: r.lastError,
      updatedAt: r.updatedAt,
    };

    // try to surface helpful identifiers without dumping full payloads
    try {
      const p = r.payload || {};
      if (type === "household") {
        return {
          ...base,
          ffgId: r.ffgId || p.__resolverHints?.ffgId || null,
          householdComposite: r.householdComposite || p.Household_ID__c || null,
          sfId: r.salesforceId || p.Id || null,
        };
      }
      if (type === "participant") {
        return {
          ...base,
          tnsId: p.TNS_Id__c || r.participantTnsId || null,
          ffgId: p.__resolverHints?.ffgId || r.ffgId || null,
          householdComposite: p.__resolverHints?.householdComposite || null,
          sfId: p.Id || r.salesforceId || null,
        };
      }
      if (type === "attendance") {
        return {
          ...base,
          ffgId: r.ffgId || p.__resolverHints?.ffgId || null,
          moduleId: r.moduleId || p.__resolverHints?.moduleId || null,
          participantSalesforceId: r.participantSalesforceId || null,
          participantTnsId: r.participantTnsId || null,
        };
      }
    } catch (_) {
      /* ignore malformed payloads */
    }

    return base;
  });
}

// --------------------------- PROGRESS API ---------------------------
app.get("/api/outbox/progress/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { runId } = req.query;

    // find the most relevant run for this project
    const run = await pickLatestRun(projectId, runId);

    // scope outbox queries to the project (and run, if present)
    const hhWhere = scopeToRun(HouseholdOutbox, projectId, run);
    const prtWhere = scopeToRun(ParticipantOutbox, projectId, run);
    const attWhere = scopeToRun(AttendanceOutbox, projectId, run);

    // per-phase counts
    const [households, participants, attendance] = await Promise.all([
      countsFor(HouseholdOutbox, hhWhere),
      countsFor(ParticipantOutbox, prtWhere),
      countsFor(AttendanceOutbox, attWhere),
    ]);

    // overall summary (UI can build a single progress bar)
    const total = households.total + participants.total + attendance.total;
    const sent = households.sent + participants.sent + attendance.sent;
    const failed = households.failed + participants.failed + attendance.failed;
    const leftToSend =
      households.leftToSend + participants.leftToSend + attendance.leftToSend;
    const percent = total ? Math.round((sent / total) * 100) : 0;

    // failed rows (current run only, if available)
    const [hhFailed, prtFailed, attFailed] = await Promise.all([
      failedRowsFor(HouseholdOutbox, hhWhere, "household"),
      failedRowsFor(ParticipantOutbox, prtWhere, "participant"),
      failedRowsFor(AttendanceOutbox, attWhere, "attendance"),
    ]);


    const isSyncing = run ? run.status === "running" || run.status === "pending" : false;

    return res.json({
      status: 200,
      projectId,
      run: run
        ? {
            id: run.id,
            status: run.status,
            startedAt: run.startedAt || run.createdAt,
            finishedAt: run.finishedAt,
            meta: run.meta || null,

            // CSV link & metadata (if you stored them on the run)
            fileUrl: run.fileUrl || null,
            fileName: run.fileName || null,
            fileBytes: run.fileBytes || null,
            mimeType: run.mimeType || null,
          }
        : null,

      // ordered to reflect the sync sequence: Households → Participants → Attendance
      phases: {
        households,
        participants,
        attendance,
      },

      summary: {
        total,
        sent,
        failed,
        leftToSend,
        percent, // 0..100
        isSyncing,
      },

      // show failed records for *this* upload (capped)
      failed: [...hhFailed, ...prtFailed, ...attFailed],
    });
  } catch (err) {
    console.error("progress api error:", err);
    return res.status(500).json({
      status: 500,
      message: err?.message || "Failed to fetch progress",
    });
  }
});

// Utility API endpoint to fetch images from Salesforce
app.get("/image/:formId/:attachmentId", async (req, res) => {
  const { formId, attachmentId } = req.params;
  const commcareApiUrl = `https://www.commcarehq.org/a/tns-proof-of-concept/api/form/attachment/${formId}/${attachmentId}`;

  console.log(`Requesting image from: ${commcareApiUrl}`);

  try {
    // Fetch the image from CommCare API
    const response = await axios.get(commcareApiUrl, {
      headers: {
        Authorization: `ApiKey ymugenga@tns.org:46fa5358cd802aabcc5c3b14a194464d40c564e6`,
      },
      responseType: "arraybuffer", // Handle binary data (e.g., images)
    });

    const resBuffer = Buffer.from(response.data, "binary"); // Convert response data to Buffer

    // Check if the image is in HEIC format or detect the type
    const detectedType = await fileType.fromBuffer(resBuffer);
    console.log(
      `Detected MIME type: ${detectedType ? detectedType.mime : "unknown"}`
    );
    if (detectedType && detectedType.mime === "image/heic") {
      // Convert HEIC to JPEG (or PNG if needed)
      const outputBuffer = await heicConvert({
        buffer: resBuffer, // The HEIC buffer
        format: "JPEG", // Convert to JPEG or PNG
        quality: 0.1, // Quality setting (0 to 1)
      });

      // Set headers and send the converted image as JPEG
      res.set("Content-Type", "image/jpeg");
      res.send(outputBuffer);
    } else if (detectedType && detectedType.mime) {
      // For other image formats, set the detected MIME type and send the image
      res.set("Content-Type", detectedType.mime);
      res.send(resBuffer);
    } else {
      // Fallback: Set the default Content-Type if MIME type is not detected
      res.set("Content-Type", "application/octet-stream");
      res.send(resBuffer);
    }
  } catch (error) {
    console.error("Error fetching the image:", error);
    res.status(500).send("Error fetching the image");
  }
});

const server = new ApolloServer({
  typeDefs: [
    PermissionsTypeDefs,
    RolesTypeDefs,
    usersTypeDefs,
    ProjectsTypeDefs,
    ProjectRoleTypeDefs,
    LoginsTypeDefs,
    TrainingGroupsTypeDefs,
    TrainingSessionsTypeDefs,
    ParticipantsTypeDefs,
    AttendanceTypeDefs,
    FarmVisitsTypeDefs,
    FVQAsTypeDefs,
    TrainingModulesTypeDefs,
    PerformanceTypeDefs,
    wetmillsTypeDefs,
    WetMillvisitsTypeDefs,
    dashboardTypeDefs,
  ],
  resolvers: [
    PermissionsResolvers,
    RolesResolvers,
    UsersResolvers,
    ProjectsResolvers,
    ProjectRoleResolvers,
    LoginsResolvers,
    TrainingGroupsResolvers,
    TrainingSessionsResolvers,
    ParticipantsResolvers,
    AttendanceResolvers,
    FarmVisitsResolvers,
    FVQAsResolvers,
    TrainingModulesResolvers,
    PerformanceResolvers,
    WetmillsResolvers,
    WetMillVisitsResolvers,
    DashboardResolvers,
  ],
  subscriptions: { path: "/subscriptions", onConnect: () => pubSub },
  csrfPrevention: true,
  cache: "bounded",
  context: ({ req }) => {
    return {
      sf_conn: conn,
    };
  },
  introspection: true,
  playground: true,
});

server
  .start()
  .then(() => {
    server.applyMiddleware({ app });

    console.log("scheduleStagedPush started");
    runPartSyncCrons(conn);

    app.listen({ port: PORT }, () => {
      console.log(
        `🚀 Server ready at http://localhost:${PORT}${server.graphqlPath}`
      );
    });
  })
  .catch(function (error) {
    console.log(error);
  });

export { conn };
