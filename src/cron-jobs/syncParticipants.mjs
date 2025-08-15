// cron/syncJobs.mjs

import cron from "node-cron";
import { ParticipantSyncService } from "../services/participantSync.service.mjs";
import Projects from "../models/projects.models.mjs";
import { conn } from "../../server.mjs";

// Daily full refresh @ 00:00
cron.schedule("0 0 * * *", async () => {
  try {
    const projects = await Projects.findAll({
      where: { attendance_full: true },
      attributes: ["sf_project_id"],
    });

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
    }

    console.log("✅ Full participant sync complete for all projects");
  } catch (err) {
    console.error("❌ Error in full participant sync:", err);
  }
});

// Hourly incremental @ minute 0
cron.schedule("0 * * * *", async () => {
  try {
    const projects = await Projects.findAll({
      where: { attendance_full: true },
      attributes: ["sf_project_id"],
    });

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
    }

    console.log("✅ Incremental participant sync complete for all projects");
  } catch (err) {
    console.error("❌ Error in incremental participant sync:", err);
  }
});
