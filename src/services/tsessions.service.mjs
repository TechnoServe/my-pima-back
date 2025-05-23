import { Op } from "sequelize";
import Projects from "../models/projects.models.mjs";
import {
  fetchRandomTSByPId,
  fetchRandomTSByFt,
  fetchFTsFromSalesforceByPId,
} from "../utils/salesforce.utils.mjs";
import logger from "../config/logger.mjs";
import moment from "moment";
import sequelize from "../config/db.mjs";
import { TsSampleRepository } from "../repositories/ts_sample.repository.mjs";
import Roles from "../models/roles.model.mjs";
import { getWeekRange } from "../utils/date.utils.mjs";
import Users from "../models/users.model.mjs";
import ProjectRole from "../models/project_role.model.mjs";
import { MailService } from "./mail.service.mjs";
import pLimit from "p-limit";

export const TSessionService = {
  // Method to sample from SF which training sessions to be approved by the MEL team
  async sampleTSForApprovals(sf_conn) {
    try {
      logger.info("Started training session sampling process.");

      // 1. load all active projects
      const projects = await Projects.findAll({
        where: { project_status: "active" },
      });

      const lastMonday = getWeekRange(1).startOfWeek;
      const lastSunday = getWeekRange(1).endOfWeek;

      // 2. set up a limiter of 10 concurrent project‐jobs
      const limit = pLimit(10);

      await Promise.all(
        projects.map((project) =>
          limit(async () => {
            try {
              let sampleSize = 10;

              // If Kenya, Ethiopia or Burundi: sample per FT
              if (
                ["Ethiopia", "Kenya", "Burundi"].includes(
                  project.project_country
                )
              ) {
                const farmerTrainers =
                  await fetchFTsFromSalesforceByPId(
                    sf_conn,
                    project.sf_project_id
                  );

                for (const trainer of farmerTrainers) {
                  const ftSamples = await TsSampleRepository.count({
                    sf_project_id: project.sf_project_id,
                    farmer_trainer_name: trainer.Staff__r.Name,
                    session_date: {
                      [Op.between]: [lastMonday, lastSunday],
                    },
                  });

                  if (ftSamples > 0) {
                    logger.info(
                      `Skipping FT ${trainer.Staff__r.Name} (already sampled).`
                    );
                  } else {
                    const tSessions = await fetchRandomTSByFt(
                      sf_conn,
                      project.sf_project_id,
                      trainer.Staff__c,
                      lastMonday,
                      lastSunday,
                      3
                    );
                    await saveTrainingSessions(
                      tSessions,
                      project.sf_project_id
                    );
                  }
                }
              } else {
                // Otherwise sample by percentage for the whole project
                const ftSamples = await TsSampleRepository.count({
                  sf_project_id: project.sf_project_id,
                  session_date: {
                    [Op.between]: [lastMonday, lastSunday],
                  },
                });

                if (ftSamples > 0) {
                  logger.info(
                    `Skipping project ${project.sf_project_id} (already sampled).`
                  );
                } else {
                  logger.info(
                    `Processing project ${project.sf_project_id}.`
                  );
                  const tSessions = await fetchRandomTSByPId(
                    sf_conn,
                    project.sf_project_id,
                    sampleSize,
                    lastMonday,
                    lastSunday
                  );
                  await saveTrainingSessions(
                    tSessions,
                    project.sf_project_id
                  );
                }
              }
            } catch (error) {
              logger.error(
                `Error processing project ${project.project_id}: ${error.message}`
              );
            }
          })
        )
      );

      logger.info("Training session sampling process completed successfully.");
    } catch (error) {
      logger.error(
        `Error during training session sampling: ${error.message}`
      );
    }
  },

  //
  async getSampledSessions(sf_project_id) {
    // Single query
    return await TsSampleRepository.findAll({
      sf_project_id: sf_project_id,
      session_image_url: { [Op.ne]: null },
    });
  },

  async getStatsByFT(projectId, startDate, endDate, status) {
    const whereConditions = {
      sf_project_id: projectId,
    };

    // Handle different date filtering cases
    if (startDate && endDate) {
      // Both startDate and endDate are provided
      whereConditions.session_date = {
        [Op.between]: [startDate, endDate],
      };
    } else if (startDate) {
      // Only startDate is provided
      whereConditions.session_date = {
        [Op.gte]: startDate,
      };
    } else if (endDate) {
      // Only endDate is provided
      whereConditions.session_date = {
        [Op.lte]: endDate,
      };
    }

    // Add status filter only if a status is provided
    if (status && status !== "all") {
      whereConditions.image_review_result;
    }

    console.log(whereConditions);

    return await TsSampleRepository.findAll(whereConditions);
  },

  async sendRemainderEmail() {
    const approverRole = await Roles.findOne({ role_name: "mel_analyst" }); // Approver needs to be a MEL analyst

    console.log(approverRole.role_id);

    const lastMonday = getWeekRange(1).startOfWeek;
    const lastSunday = getWeekRange(1).endOfWeek;

    const users = await Users.findAll({
      where: { role_id: approverRole.role_id },
    });

    console.log(`Got ${users.length} Users`);

    await Promise.all(
      users.map(async (user) => {
        // Define data to be sent in the email
        const samplingReport = {
          sampling_start_date: lastMonday, // You can adjust this date dynamically if needed
          sampling_end_date: lastSunday, // You can adjust this date dynamically if needed
          projects: [],
          review_link: "https://pima.ink/in/trainsession/verification",
        };

        const userProjects = [];

        const project_roles = await ProjectRole.findAll({
          where: { user_id: user.user_id, role: approverRole.role_id },
        });

        await Promise.all(
          project_roles.map(async (projectRole) => {
            const project = await Projects.findByPk(projectRole.project_id);

            const totalSampled = await TsSampleRepository.count({
              sf_project_id: project.sf_project_id,
            });

            const remaining = await TsSampleRepository.count({
              sf_project_id: project.sf_project_id,
              image_review_result: null,
            });

            if (remaining > 0) {
              userProjects.push({
                name: project.project_name,
                total_sampled_records: totalSampled,
                total_reviewed_records: totalSampled - remaining,
                remaining_records: remaining,
                id: project.sf_project_id,
              });
            }
          })
        );

        samplingReport.projects = samplingReport.projects.concat(userProjects);
        MailService.sendTSReviewReminder(user.user_email, samplingReport);
      })
    );
  },
};

const saveTrainingSessions = async (sessions, sf_project_id) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();

    // Extract the sf_training_session_id values from the incoming sessions
    const sessionIds = sessions.map((sample) => sample.Id);

    console.log(sessionIds);
    // Fetch existing records with the same sf_training_session_id
    const existingSessions = await TsSampleRepository.findAll({
      sf_training_session_id: { [Op.in]: sessionIds }, // Matches the way `findAll` is structured
    });

    // Create a Set of existing session IDs for fast lookup
    const existingSessionIds = new Set(
      existingSessions.map((s) => s.sf_training_session_id)
    );

    // Filter out sessions that already exist in the database
    const newSessions = sessions.filter(
      (sample) => !existingSessionIds.has(sample.Id)
    );

    if (newSessions.length === 0) {
      console.log("No new sessions to insert. Skipping save.");
      await transaction.commit();
      return;
    }

    for (let i = 0; i < newSessions.length; i += 100) {
      const batch = sessions.slice(i, i + 100);

      // Batch save farm visits
      const sampleRecords = await TsSampleRepository.bulkCreate(
        batch.map((sample) => ({
          sf_training_session_id: sample.Id,
          sf_project_id: sf_project_id,
          sf_training_module_id: sample.Training_Module__c,
          training_module_name: sample.Module_Name__c,
          tg_name: sample.Training_Group__r.Name,
          tg_tns_id: sample.Training_Group__r.TNS_Id__c,
          total_attendance: sample.Male_Attendance__c
            ? sample.Number_in_Attendance__c
            : sample.Total_Count_Light_Full__c,
          male_attendance: sample.Male_Attendance__c
            ? sample.Male_Attendance__c
            : sample.Male_Count_Light_Full__c,
          female_attendance: sample.Female_Attendance__c
            ? sample.Female_Attendance__c
            : sample.Female_Count_Light_Full__c,
          farmer_trainer_name: sample.Trainer__r.Name,
          session_image_url: sample.Session_Photo_URL__c,
          session_date: sample.Date__c,
          ts_latitude: sample.Location_GPS__Latitude__s,
          ts_longitude: sample.Location_GPS__Longitude__s,
        })),
        { transaction }
      );
    }

    await transaction.commit();
    logger.info("TS samples saved successfully in batches.");
    logger.info(sf_project_id);
  } catch (error) {
    if (transaction) await transaction.rollback();
    logger.error(`Error saving TS samples: ${error.message}`);
  }
};
