import cron from "node-cron";
import { AttendanceService } from "../services/attendance.service.mjs";
import { conn } from "../../server.mjs";
import logger from "../config/logger.mjs";
import { TSessionService } from "../services/tsessions.service.mjs";

// Schedule cron job to run every hour
// cron.schedule("0 */8 * * *", async () => {
//   try {
//     logger.info("Attendance caching beginning.");
//     await AttendanceService.cacheAttendanceData(conn);
//     logger.info("Attendance caching done.");
//   } catch (error) {
//     logger.info("Attendance caching failed with message" + error);
//   }
// });

// Schedule Attendance Sampling process
cron.schedule("0 2 * * 1", async () => {
  try {
    logger.info("Starting Training Session Sampling process...");
    await TSessionService.sampleTSForApprovals(conn);
    logger.info("Sampling process completed.");
  } catch (error) {
    logger.error("Error in TS sampling process:", error);
  }
});


cron.schedule("0 10 * * 1", async () => {
  try {
    logger.info("Sending TS reminder email");
    await TSessionService.sendRemainderEmail(conn);
    logger.info("Email sent");
  } catch (error) {
    logger.error("Error in sending email:", error);
  }
});
