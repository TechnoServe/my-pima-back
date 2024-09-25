import cron from "node-cron";
import { AttendanceService } from "../services/attendance.service.mjs";
import { conn } from "../../server.mjs";
import logger from "../config/logger.mjs";
import { ParticipantsService } from "../services/participant.service.mjs";
import Projects from "../models/projects.models.mjs";

// Schedule cron job to run every hour
cron.schedule("0 * * * *", async () => {
  try {
    logger.info("Attendance caching beginning.");
    await AttendanceService.cacheAttendanceData(conn);
    logger.info("Attendance caching done.");
  } catch (error) {
    logger.info("Attendance caching failed with message" + error);
  }
});

// Schedule to fetch participants every hour
// cron.schedule("0 * * * *", async () => {
//   try {
//     logger.info("Starting participants caching process...");
//     const projects = await Projects.findAll({
//       where: { project_status: "active" },
//     });

//     for (let project of projects) {
//       logger.info("processing project", project);
//       await ParticipantsService.fetchAndCacheParticipants(
//         conn,
//         project.sf_project_id
//       );
//     }

//     logger.info("Participants caching completed.");
//   } catch (error) {
//     logger.info("Error in participants caching process:", error);
//   }
// });
