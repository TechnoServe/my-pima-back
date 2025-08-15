import cron from "node-cron";
import { AttendanceService } from "../services/attendance.service.mjs";
import { conn } from "../../server.mjs";
import logger from "../config/logger.mjs";
import { TSessionService } from "../services/tsessions.service.mjs";
import { AttendanceSyncService } from "../services/attendanceSync.service.mjs";
import Projects from "../models/projects.models.mjs";

// Schedule Attendance Sampling process every Monday at 2 AM
cron.schedule("0 2 * * 1", async () => {
  try {
    logger.info("Starting Training Session Sampling process...");
    await TSessionService.sampleTSForApprovals(conn);
    logger.info("Sampling process completed.");
  } catch (error) {
    logger.error("Error in TS sampling process:", error);
  }
});

// Send Training Session reminder email every Monday at 10 AM
cron.schedule("0 10 * * 1", async () => {
  try {
    logger.info("Sending TS reminder email");
    await TSessionService.sendRemainderEmail(conn);
    logger.info("Email sent");
  } catch (error) {
    logger.error("Error in sending email:", error);
  }
});

// Sync Attendance from Salesforce to Postgres every hour
cron.schedule("0 * * * *", async () => {
  try {
    const projects = await Projects.findAll({
      where: { attendance_full: true },
    });

    if (!projects.length) {
      return;
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
      return;
    }

    console.log("✅ All projects synced");
  } catch (err) {
    console.error("❌ Error in SF→PG sync:", err);
  }
});
