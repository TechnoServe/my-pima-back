import cron from "node-cron";
import { sampleFarmVisits } from "../services/farmVisitSampler.service.mjs";

// Schedule cron job to run every Monday at 1 AM
cron.schedule("0 1 * * 1", async () => {
  try {
    console.log("Starting sampling process...");
    await sampleFarmVisits();
    console.log("Sampling process completed.");
  } catch (error) {
    console.error("Error in sampling process:", error);
  }
});
