import {
  fetchFTsFromSalesforceByPId,
  fetchFarmVisitsFromSalesforce,
} from "../utils/salesforce.utils.mjs";
import sequelize from "../config/db.mjs";
import logger from "../config/logger.mjs";
import { FarmVisitRepository } from "../repositories/farmVisit.repository.mjs";
import { BestPracticeRepository } from "../repositories/bestPractice.repository.mjs";
import moment from "moment";
import { Op } from "sequelize"; // Ensure this is imported
import BestPractice from "../models/best_practice.model.mjs";

const BATCH_SIZE = 100;

// Custom field mapping for best practices
const bpFieldMapping = [
  {
    practiceName: "Compost",
    fields: [
      {
        field: "Do_you_have_compost_manure__c",
        fieldLabel: "Do you have compost manure?",
        imageField: "photo_of_the_compost_manure__c",
        hasResults: false,
      },
    ],
  },
  // Add more mappings as needed
];
export const FarmVisitService = {
  // Main cron job function
  async sampleFarmVisits(sf_conn) {
    try {
      const projects = await getProjectsToSample();

      logger.info(`Found ${projects.length} projects to sample.`);

      // Process projects in parallel for efficiency
      await Promise.all(
        projects.map(async (project) => {
          try {
            const farmerTrainers = await fetchFTsFromSalesforceByPId(
              sf_conn,
              project.sf_project_id
            );

            logger.info(
              `Processing project ${project.sf_project_id} with ${farmerTrainers.length} Farmer Trainers.`
            );

            for (const trainer of farmerTrainers) {
              const farmVisits = await fetchFarmVisitsFromSalesforce(
                sf_conn,
                trainer.Staff__c
              );

              const sampledVisits = await sampleVisitsForTrainer(
                project,
                farmVisits
              );

              const visitsToSave = sampledVisits.map((visit) => {
                const bestPractices = extractBestPracticesFromVisit(
                  bpFieldMapping,
                  visit
                );
                return {
                  sf_visit_id: visit.Id,
                  sf_project_id: project.sf_project_id,
                  farmer_name: visit.Farm_Visit__r.Farm_Visited__r.Name,
                  farmer_pima_id: visit.Farm_Visit__r.Farm_Visited__c,
                  farmer_tns_id: visit.Farm_Visit__r.Farm_Visited__r.TNS_Id__c,
                  date_visited: visit.Farm_Visit__r.Date_Visited__c,
                  farmer_trainer: visit.Farm_Visit__r.Farmer_Trainer__r.Name,
                  date_sampled: new Date(),
                  bestPractices: bestPractices,
                };
              });

              await saveFarmVisitSamplesInBatches(visitsToSave);
            }
          } catch (error) {
            logger.error(
              `Error processing project ${project.sf_project_id}: ${error.message}`
            );
          }
        })
      );

      logger.info("Farm visit sampling process completed successfully.");
    } catch (error) {
      logger.error(`Error during farm visit sampling: ${error.message}`);
    }
  },
  async getSampledVisitsStats(projectId) {
    const startOfLastWeek = moment()
      .subtract(1, "weeks")
      .startOf("week")
      .toDate();
    const endOfLastWeek = moment().subtract(1, "weeks").endOf("week").toDate();

    const totalReviewed = await FarmVisitRepository.count({
      sf_project_id: projectId,
      overall_status: "Reviewed",
      date_visited: {
        [Op.between]: [startOfLastWeek, endOfLastWeek],
      },
    });

    const totalSampledVisits = await FarmVisitRepository.count({
      sf_project_id: projectId,
      date_visited: {
        [Op.between]: [startOfLastWeek, endOfLastWeek],
      },
    });

    const remainingVisits = totalSampledVisits - totalReviewed;
    return { totalSampledVisits, totalReviewed, remainingVisits };
  },

  async getBestPracticeReviewStats(projectId, practiceName) {
    const startOfLastWeek = moment()
      .subtract(1, "weeks")
      .startOf("week")
      .toDate();
    const endOfLastWeek = moment().subtract(1, "weeks").endOf("week").toDate();

    // Get total visits for the given practice within the project and date range
    const totalVisits = await BestPracticeRepository.countWithFarmVisit(
      { practice_name: practiceName },
      {
        sf_project_id: projectId,
        date_visited: {
          [Op.between]: [startOfLastWeek, endOfLastWeek],
        },
      }
    );

    // Get reviewed visits for the given practice
    const reviewedVisits = await BestPracticeRepository.countWithFarmVisit(
      {
        practice_name: practiceName,
        correct_answer: { [Op.not]: null },
      },
      {
        sf_project_id: projectId,
        date_visited: {
          [Op.between]: [startOfLastWeek, endOfLastWeek],
        },
      }
    );

    const remainingVisits = totalVisits - reviewedVisits;

    return {
      totalVisits,
      reviewedVisits,
      remainingVisits,
    };
  },

  async getPaginatedReviews(projectId, practiceName, page, pageSize) {
    const startOfLastWeek = moment()
      .subtract(1, "weeks")
      .startOf("week")
      .toDate();
    const endOfLastWeek = moment().subtract(1, "weeks").endOf("week").toDate();

    // Single query to fetch farm visits and their relevant best practice
    const paginatedReviews = await FarmVisitRepository.findAllWithBestPractices(
      {
        sf_project_id: projectId,
        date_visited: {
          [Op.between]: [startOfLastWeek, endOfLastWeek],
        },
      },
      {
        practice_name: practiceName,
        correct_answer: null,
      },
      pageSize,
      page
    );

    paginatedReviews.forEach((visit) => {
        console.log(visit.BestPractices);
    });
      

    return paginatedReviews;
  },
};

// Batch processing for saving farm visits and best practices
const saveFarmVisitSamplesInBatches = async (visits) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();

    for (let i = 0; i < visits.length; i += BATCH_SIZE) {
      const batch = visits.slice(i, i + BATCH_SIZE);

      // Batch save farm visits
      const farmVisitRecords = await FarmVisitRepository.bulkCreate(
        batch.map((visit) => ({
          sf_visit_id: visit.sf_visit_id,
          sf_project_id: visit.sf_project_id,
          farmer_name: visit.farmer_name,
          farmer_pima_id: visit.farmer_pima_id,
          farmer_tns_id: visit.farmer_tns_id,
          date_visited: visit.date_visited,
          farmer_trainer: visit.farmer_trainer,
          date_sampled: visit.date_sampled,
        })),
        { transaction }
      );

      // Batch save best practices
      const bestPracticeRecords = batch.flatMap((visit, index) =>
        visit.bestPractices.map((practice) => ({
          visit_id: farmVisitRecords[index].visit_id,
          practice_name: practice.practice_name,
          image_url: practice.image_url,
          sf_practice_id: practice.sf_practice_id,
          question: practice.question,
          answer: practice.answer,
        }))
      );

      await BestPracticeRepository.bulkCreate(bestPracticeRecords, {
        transaction,
      });
    }

    await transaction.commit();
    logger.info("Farm visit samples saved successfully in batches.");
  } catch (error) {
    if (transaction) await transaction.rollback();
    logger.error(`Error saving farm visit samples: ${error.message}`);
  }
};

// Extract best practices from the farm visit data
const extractBestPracticesFromVisit = (bpFieldMapping, visit) => {
  const bestPractices = [];

  for (const bp of bpFieldMapping) {
    for (const field of bp.fields) {
      const record = {
        sf_practice_id: visit.Id,
        practice_name: bp.practiceName,
        question: field.fieldLabel,
        answer: !field.hasResults ? visit[field.field] : null,
        image_url: visit[field.imageField],
      };

      bestPractices.push(record);
    }
  }

  return bestPractices;
};

// Sampling logic: choose visits per trainer
const sampleVisitsForTrainer = async (project, farmVisits) => {
  if (["Zimbambwe", "Puerto Rico"].includes(project.project_country)) {
    return farmVisits; // 100% sampling
  } else {
    return farmVisits.slice(0, project.sampleSize || 1); // Sample based on project size
  }
};

// Helper to get the list of projects to sample from Salesforce
const getProjectsToSample = async () => {
  // Implement the logic to get projects from Salesforce or another source
  return [
    {
      sf_project_id: "a0E1o00000krP5jEAE",
      sampleAll: true,
      sampleSize: null,
      project_country: "Burundi",
    },
    {
      sf_project_id: "a0E9J000000NTjpUAG",
      sampleAll: false,
      sampleSize: 1,
      project_country: "Kenya",
    },
  ];
};
