import { Op } from "sequelize";
import Projects from "../models/projects.models.mjs";
import { fetchRandomTSByPId } from "../utils/salesforce.utils.mjs";
import logger from "../config/logger.mjs";
import moment from "moment";
import sequelize from "../config/db.mjs";
import { TsSampleRepository } from "../repositories/ts_sample.repository.mjs";

export const TSessionService = {
  // Method to sample from SF which training sessions to be approved by the MEL team
  async sampleTSForApprovals(sf_conn) {
    try {
      logger.info("Started training session sampling process.");
      const projects = await Projects.findAll({
        status: "active",
         //project_country: { [Op.not]: null },
      });

      const lastMonday = moment()
        .subtract(1, "weeks")
        .startOf("isoWeek")
        .format("YYYY-MM-DD"); // Format as DateTime
      const lastSunday = moment()
        .subtract(1, "weeks")
        .endOf("isoWeek")
        .format("YYYY-MM-DD"); // Format as DateTime

      await Promise.all(
        projects.map(async (project) => {
          try {
            let sampleSize = 10;
            if (["Ethiopia", "Kenya"].includes(project.project_country)) {
              sampleSize = 5;
            }

            console.log(project.project_name);

            const tSessions = await fetchRandomTSByPId(
              sf_conn,
              project.sf_project_id,
              sampleSize,
              lastMonday,
              lastSunday
            );

            await saveTrainingSessions(tSessions, project.sf_project_id);
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
    const startOfLastWeek = moment()
      .subtract(1, "weeks")
      .startOf("week")
      .toDate();
    const endOfLastWeek = moment().subtract(1, "weeks").endOf("week").toDate();

    // Single query
    const hi =  await TsSampleRepository.findAll({
      sf_project_id: sf_project_id,
      session_date: {
        [Op.between]: [startOfLastWeek, endOfLastWeek],
      },
    });

    console.log(hi);
    return hi
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
          total_attendance: sample.Number_in_Attendance__c,
          male_attendance: sample.Male_Attendance__c,
          female_attendance: sample.Female_Attendance__c,
          farmer_trainer_name: sample.Trainer__r.Name,
          session_image_url: sample.Session_Photo_URL__c,
          session_date: sample.Date__c,
        })),
        { transaction }
      );
    }

    await transaction.commit();
    logger.info("Farm visit samples saved successfully in batches.");
  } catch (error) {
    if (transaction) await transaction.rollback();
    logger.error(`Error saving farm visit samples: ${error.message}`);
  }
};
