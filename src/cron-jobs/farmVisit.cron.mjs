import cron from "node-cron";
import { FarmVisitService } from "../services/farmVisit.service.mjs";
import { conn } from "../../server.mjs";

cron.schedule("0 1 * * 1", async () => {
  try {
    console.log("Starting sampling process...");
    await FarmVisitService.sampleFarmVisits(conn);
    console.log("Sampling process completed.");
  } catch (error) {
    console.error("Error in sampling process:", error);
  }
});

cron.schedule("1 10 * * 1", async () => {
  try {
    logger.info("Sending FV reminder email");
    await FarmVisitService.sendRemainderEmail(conn);
    logger.info("Email sent");
  } catch (error) {
    logger.error("Error in sending email:", error);
  }
});
