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

export const TSessionService = {
  // Method to sample from SF which training sessions to be approved by the MEL team
  async sampleTSForApprovals(sf_conn) {
    try {
      logger.info("Started training session sampling process.");
      const projects = await Projects.findAll({
        status: "active",
        //project_country: { [Op.not]: null },
      });

      const lastMonday = getWeekRange(1).startOfWeek;
      const lastSunday = getWeekRange(1).endOfWeek;

      await Promise.all(
        projects.map(async (project) => {
          try {
            let sampleSize = 10;

            // If Kenya and Ethiopia sample by FTs
            if (["Ethiopia", "Kenya", "Burundi"].includes(project.project_country)) {
              const farmerTrainers = await fetchFTsFromSalesforceByPId(
                sf_conn,
                project.sf_project_id
              );

              for (const trainer of farmerTrainers) {
                // Check if we already sampled for current FT
                const ftSamples = await TsSampleRepository.count({
                  sf_project_id: project.sf_project_id,
                  farmer_trainer_name: trainer.Staff__r.Name,
                  session_date: {
                    [Op.between]: [lastMonday, lastSunday],
                  },
                });

                // Don't sample for FT if they already have a sampled record
                if (ftSamples > 0) {
                  logger.info(
                    `Skipping processing for FT: ${trainer.Staff__r.Name}.`
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

                  await saveTrainingSessions(tSessions, project.sf_project_id);
                }
              }
            } else {
              // Here we sample by percentage

              const ftSamples = await TsSampleRepository.count({
                sf_project_id: project.sf_project_id,
                session_date: {
                  [Op.between]: [lastMonday, lastSunday],
                },
              });

              // Don't sample for Project if they already have a sampled record
              if (ftSamples > 0) {
                logger.info(
                  `Skipping processing for Project: ${project.sf_project_id}.`
                );
              } else {
                console.log(
                  `processing fpr project with ID ${project.sf_project_id}`
                );
                const tSessions = await fetchRandomTSByPId(
                  sf_conn,
                  project.sf_project_id,
                  sampleSize,
                  lastMonday,
                  lastSunday
                );

                await saveTrainingSessions(tSessions, project.sf_project_id);
              }
            }
          } catch (error) {
            console.log(error);
            logger.error(`Error processing project: ${project.project_id}`);
          }
        })
      );
    } catch (error) {
      logger.error(`Error during training session sampling: ${error.message}`);
    }
  },

  //
  async getSampledSessions(sf_project_id) {
    // Single query
    return await TsSampleRepository.findAll({
      sf_project_id: sf_project_id,
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

    for (let i = 0; i < sessions.length; i += 100) {
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
