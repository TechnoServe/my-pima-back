import {
  fetchFTsFromSalesforceByPId,
  fetchFarmVisitsFromSalesforce,
  fetchTrainingGroupsByProjectId,
  fetchFarmVisitsByTrainingGroups,
} from "../utils/salesforce.utils.mjs";
import sequelize from "../config/db.mjs";
import logger from "../config/logger.mjs";
import { FarmVisitRepository } from "../repositories/farmVisit.repository.mjs";
import { BestPracticeRepository } from "../repositories/bestPractice.repository.mjs";
import moment from "moment";
import { Op } from "sequelize";
import BestPractice from "../models/best_practice.model.mjs";
import FarmVisit from "../models/farm_visit.model.mjs";
import Projects from "../models/projects.models.mjs";
import ProjectRole from "../models/project_role.model.mjs";
import { MailService } from "./mail.service.mjs";
import Users from "../models/users.model.mjs";
import Roles from "../models/roles.model.mjs";
import { getWeekRange } from "../utils/date.utils.mjs";

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
  {
    practiceName: "Record Book",
    fields: [
      {
        field: "are_there_records_on_the_record_book__c",
        fieldLabel: "Are there records on the record book?",
        imageField: "take_a_photo_of_the_record_book__c",
        hasResults: false,
      },
    ],
  },
  {
    practiceName: "Shade Management",
    fields: [
      {
        field: "level_of_shade_present_on_the_farm__c",
        fieldLabel: "What is the level of shade present on the farm?",
        imageField: "photo_of_level_of_shade_on_the_plot__c",
        hasResults: false,
      },
    ],
  },
  {
    practiceName: "Weeding",
    fields: [
      {
        field: "how_many_weeds_under_canopy_and_how_big__c",
        fieldLabel: "How many weeds are under the canopy and how big are they?",
        imageField: "photo_of_weeds_under_the_canopy__c",
        hasResults: false,
      },
    ],
  },
  {
    practiceName: "Stumping",
    fields: [
      {
        field: "stumping_method_on_majority_of_trees__c",
        fieldLabel:
          "Has the farmer stumped any coffee trees in the field visited since training started?",
        imageField: "photos_of_stumped_coffee_trees__c",
        hasResults: false,
      },
    ],
  },
  {
    practiceName: "Main Stems",
    fields: [
      {
        field: "number_of_main_stems_on_majority_trees__c",
        fieldLabel: "How many main stems are on the majority of the trees?",
        imageField: "photo_of_trees_and_average_main_stems__c",
        hasResults: false,
      },
    ],
  },
];
export const FarmVisitService = {
  // Method to fetch farm visit by Project from SF
  async getFarmVisitsByProject(sf_conn, project_id) {
    const tg_ids = await fetchTrainingGroupsByProjectId(sf_conn, project_id);
    const farmVisits = await fetchFarmVisitsByTrainingGroups(sf_conn, tg_ids);
    const mappedFarmVisits = processFVResponse(farmVisits);

    return mappedFarmVisits;
  },

  // Method to handle the farm visit sampling process
  async sampleFarmVisits(sf_conn) {
    try {
      const projects = await getProjectsToSample();

      logger.info(`Found ${projects.length} projects to sample.`);

      // Process projects in parallel for efficiency
      await Promise.all(
        projects.map(async (project) => {
          try {
            const lastMonday = moment()
              .subtract(1, "weeks")
              .startOf("isoWeek")
              .format("YYYY-MM-DD");
            const lastSunday = moment()
              .subtract(1, "weeks")
              .endOf("isoWeek")
              .format("YYYY-MM-DD");
            const farmerTrainers = await fetchFTsFromSalesforceByPId(
              sf_conn,
              project.sf_project_id
            );

            // Check if project has been sampled already last week
            logger.info(
              `Processing project ${project.sf_project_id} with ${farmerTrainers.length} Farmer Trainers.`
            );

            for (const trainer of farmerTrainers) {
              const recordsFound = await FarmVisitRepository.count({
                sf_project_id: project.sf_project_id,
                farmer_trainer: trainer.Staff__r.Name,
                date_visited: {
                  [Op.between]: [lastMonday, lastSunday],
                },
              });

              // If FT already sampled. Skip them.
              if (recordsFound > 0) {
                logger.info(
                  `Skipping processing for FT: ${trainer.Staff__r.Name}.`
                );
              } else {
                const farmVisits = await fetchFarmVisitsFromSalesforce(
                  sf_conn,
                  trainer.Staff__c,
                  lastMonday,
                  lastSunday
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
                    farmer_tns_id:
                      visit.Farm_Visit__r.Farm_Visited__r.TNS_Id__c,
                    date_visited: visit.Farm_Visit__r.Date_Visited__c,
                    farmer_trainer: visit.Farm_Visit__r.Farmer_Trainer__r.Name,
                    date_sampled: new Date(),
                    bestPractices: bestPractices,
                  };
                });

                await saveFarmVisitSamplesInBatches(visitsToSave);
              }
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
        correct_answer: { [Op.is]: null },
      },
      pageSize,
      page
    );

    return paginatedReviews.filter((review) => review.BestPractices.length > 0);
  },

  // Get farm visit stats for each farmer trainer
  async getFarmVisitStatisticsByTrainer(projectId) {
    // Step 1: Fetch all distinct practice names from the database
    const distinctBestPractices = await BestPracticeRepository.findAll({
      attributes: ["practice_name"],
      group: ["practice_name"], // Group by practice_name to avoid duplicates
    });

    // Extract best practice names from the result
    const bestPracticeTypes = distinctBestPractices.map(
      (bp) => bp.practice_name
    );

    // Fetch farm visits grouped by farmer trainer
    const farmVisits = await FarmVisitRepository.findAll({
      where: { sf_project_id: projectId },
      attributes: [
        "farmer_trainer",
        [sequelize.fn("ARRAY_AGG", sequelize.col("visit_id")), "visit_ids"], // Correct aggregation and alias
      ],
      group: ["farmer_trainer"], // Grouping by farmer_trainer
      raw: true, // Ensures the results are returned as raw data (not as Sequelize model instances)
    });

    console.log(farmVisits[0].visit_ids);

    // Process each farmer trainer's visits
    const trainerStats = farmVisits.map(async (visitGroup) => {
      const { farmer_trainer, visit_ids } = visitGroup;

      // console.log(farmer_trainer, visit_ids);

      // Ensure `visit_ids` is valid and not empty
      if (!visit_ids || visit_ids.length === 0) {
        return {
          farmer_trainer,
          totalSampled: 0,
          bestPracticeStats: {},
        };
      }

      // Get the total number of sampled farm visits for this trainer
      const totalSampled = await FarmVisitRepository.count({
        sf_project_id: projectId,
        farmer_trainer: farmer_trainer,
      });

      // Object to store the percentage results for each best practice
      const bestPracticeStats = {};

      for (const practiceName of bestPracticeTypes) {
        // Get all best practices for this farm trainer with the given practice type
        const bestPractices = await BestPracticeRepository.findAll({
          where: {
            visit_id: {
              [Op.in]: visit_ids, // Ensure visit_ids is an array
            },
            practice_name: practiceName,
          },
        });

        // Ensure `bestPractices` is valid and an array
        if (!bestPractices || bestPractices.length === 0) {
          bestPracticeStats[practiceName] = {
            yesPercentage: "0.00",
            noPercentage: "0.00",
            unclearPercentage: "0.00",
            notReviewedPercentage: "100.00",
          };
          continue;
        }

        // Count the number of Yes, No, Unclear, and Not Reviewed responses for this best practice type
        const yesCount = bestPractices.filter(
          (bp) => bp.correct_answer === "yes"
        ).length;
        const noCount = bestPractices.filter(
          (bp) => bp.correct_answer === "no"
        ).length;
        const unclearCount = bestPractices.filter(
          (bp) => bp.correct_answer === "unclear"
        ).length;
        const reviewedCount = yesCount + noCount + unclearCount;
        const notReviewedCount = totalSampled - reviewedCount;

        // Calculate percentages based on total sampled farm visits
        const yesPercentage = ((yesCount / totalSampled) * 100).toFixed(2);
        const noPercentage = ((noCount / totalSampled) * 100).toFixed(2);
        const unclearPercentage = ((unclearCount / totalSampled) * 100).toFixed(
          2
        );
        const notReviewedPercentage = (
          (notReviewedCount / totalSampled) *
          100
        ).toFixed(2);

        // Store the percentages for the current best practice type
        bestPracticeStats[practiceName] = {
          yesPercentage,
          noPercentage,
          unclearPercentage,
          notReviewedPercentage,
        };
      }

      return {
        farmer_trainer,
        totalSampled,
        bestPracticeStats, // Contains percentages for each best practice type
      };
    });

    return Promise.all(trainerStats);
  },

  async submitBatch(input) {
    try {
      for (const item of input) {
        const { practice_id, correct_answer, comment, user_id } = item;

        // Update the BestPractice record
        await BestPracticeRepository.update(practice_id, {
          correct_answer,
          comments: comment,
        });

        // Check if all BestPractices under the same FarmVisit are reviewed
        const bestPractice = await BestPracticeRepository.findById(practice_id);
        const allReviewed = await BestPracticeRepository.checkAllReviewed(
          bestPractice.visit_id
        );

        if (allReviewed) {
          // Update FarmVisit to 'Reviewed'
          await FarmVisitRepository.update(bestPractice.visit_id, {
            overall_status: "Reviewed",
            last_reviewed_by: user_id,
          });
        }
      }

      return {
        success: true,
        message: "Batch submitted successfully!",
      };
    } catch (error) {
      console.error(error);
      return {
        success: false,
        message: "Failed to submit batch.",
      };
    }
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
          sampling_start_date: lastMonday,
          sampling_end_date: lastSunday,
          projects: [],
          review_link: "https://pima.ink/in/farmvisit/verification",
        };

        const userProjects = [];

        const project_roles = await ProjectRole.findAll({
          where: { user_id: user.user_id, role: approverRole.role_id },
        });

        await Promise.all(
          project_roles.map(async (projectRole) => {
            const project = await Projects.findByPk(projectRole.project_id);

            const totalSampled = await FarmVisitRepository.count({
              sf_project_id: project.sf_project_id,
            });

            const remaining = await FarmVisitRepository.count({
              sf_project_id: project.sf_project_id,
              overall_status: "Not Reviewed",
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
        MailService.sendFVReviewReminder(user.user_email, samplingReport);
      })
    );
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

      if (record.image_url !== null) {
        bestPractices.push(record);
      }
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
      sf_project_id: "a0E9J000000KjhSUAS",
      project_country: "Ethiopia",
      sampleSize: 1,
      sampleAll: false,
    },
    {
      sf_project_id: "a0E9J000000KrqmUAC",
      project_country: "Ethiopia",
      sampleSize: 1,
      sampleAll: false,
    },
    {
      sf_project_id: "a0E9J000000L53sUAC",
      project_country: "Ethiopia",
      sampleSize: 1,
      sampleAll: false,
    },
    {
      sf_project_id: "a0EOj000000wZ5RMAU",
      project_country: "Ethiopia",
      sampleSize: 1,
      sampleAll: false,
    },
    {
      sf_project_id: "a0EOj000000yCr7MAE",
      project_country: "Ethiopia",
      sampleSize: 1,
      sampleAll: false,
    },
    {
      sf_project_id: "a0E7S0000009aIAUAY",
      sampleAll: true,
      sampleSize: null,
      project_country: "Zimbambwe",
    },
    {
      sf_project_id: "a0E1o00000krP5jEAE",
      sampleAll: true,
      sampleSize: null,
      project_country: "Zimbambwe",
    },
    {
      sf_project_id: "a0E1o00000nM1hfEAC",
      sampleAll: true,
      sampleSize: null,
      project_country: "Zimbambwe",
    },
    {
      sf_project_id: "a0E9J000000NTjpUAG",
      sampleAll: false,
      sampleSize: 1,
      project_country: "Kenya",
    },
    {
      sf_project_id: "a0EOj000000VN5BMAW",
      sampleAll: false,
      sampleSize: 1,
      project_country: "Kenya",
    },
    {
      sf_project_id: "a0EOj000002RJS1MAO",
      sampleAll: false,
      sampleSize: 1,
      project_country: "Kenya",
    },
  ];
};

const processFVResponse = (farmVisits) =>
  farmVisits.map((fv) => ({
    fv_id: fv.Id,
    fv_name: fv.Name,
    training_group: fv.Training_Group__r.Name,
    training_session: fv.Training_Session__r
      ? fv.Training_Session__r.Name
      : "N/A",
    tg_tns_id: fv.Training_Group__r.TNS_Id__c || "N/A",
    farmer_tns_id: fv.Farm_Visited__r.TNS_Id__c || "N/A",
    household_tns_id: fv.Farm_Visited__r.Household__r.Household_ID__c || "N/A",
    farm_visited: fv.Farm_Visited__r
      ? fv.Farm_Visited__r.Name + " " + fv.Farm_Visited__r.Last_Name__c
      : "N/A",
    farmer_trainer: fv.Farmer_Trainer__r.Name || "N/A",
    has_training: fv.Visit_Has_Training__c || "No",
    date_visited: fv.Date_Visited__c,
    pima_household_id: fv.Farm_Visited__r.Household__c,
    pima_farmer_id: fv.Farm_Visited__c,
  }));
