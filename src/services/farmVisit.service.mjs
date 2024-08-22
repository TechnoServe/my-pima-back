import {
  fetchFTsFromSalesforceByPId,
  fetchFarmVisitsFromSalesforce,
} from "../utils/salesforce.utils.mjs";
import sequelize from "../config/db.mjs";
import logger from "../config/logger.mjs";
import { FarmVisitRepository } from "../repositories/farmVisit.repository.mjs";
import { BestPracticeRepository } from "../repositories/bestPractice.repository.mjs";

export const sampleFarmVisits = async (sf_conn) => {
  try {
    // Get a list of projects that need sampling from Salesforce or other source
    const projects = await getProjectsToSample();

    logger.info(`Found ${projects.length} projects to sample.`);

    for (const project of projects) {
      const farmerTrainer = await fetchFTsFromSalesforceByPId(
        sf_conn,
        project.sf_project_id
      );
      for (const trainer of farmerTrainer) {
        // Fetch farm visits for each trainer from Salesforce
        const farmVisits = await fetchFarmVisitsFromSalesforce(
          sf_conn,
          trainer.Staff__c
        );

        // logger.info(
        //   `Retieved ${farmVisits.length} visits for FT with id ${trainer.Staff__c}`
        // );
        // Sample farm visits based on project configuration
        const sampledVisits = await sampleVisitsForTrainer(project, farmVisits);
        // logger.info(
        //   `Retieved ${farmVisits.length} visits for FT with id ${trainer.Staff__c}`
        // );

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
        ];

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

        // logger.info(
        //     `Processed ${visitsToSave.length} visits for FT with id ${trainer.Staff__c}`
        //   );

        // Save sampled farm visits to the database
        for (const visit of visitsToSave) {
          await saveFarmVisitSample(visit);
        }
      }
    }
  } catch (error) {
    logger.error(`Error during sampling: ${error.message}`);
    throw error;
  }
};

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

// Sample farm visits based on project rules
const sampleVisitsForTrainer = async (project, farmVisits) => {
  // Custom sampling logic per project
  if (["Burundi", "Puerto Rico"].includes(project.sf_project_id)) {
    // 100% sampling for ZB and PR
    return farmVisits;
  } else {
    // Sample only 1 visit per Farmer Trainer for other projects
    return farmVisits.slice(0, project.sampleSize || 1);
  }
};

// Save sampled farm visit to the database
const saveFarmVisitSample = async (sample) => {
  let transaction;
  try {
    // Start transaction
    transaction = await sequelize.transaction();

    // Save farm visit using the repository
    const farmVisit = await FarmVisitRepository.create(
      {
        sf_visit_id: sample.sf_visit_id,
        sf_project_id: sample.sf_project_id,
        farmer_name: sample.farmer_name,
        farmer_pima_id: sample.farmer_pima_id,
        farmer_tns_id: sample.farmer_tns_id,
        date_visited: sample.date_visited,
        farmer_trainer: sample.farmer_trainer,
        date_sampled: new Date(),
      },
      { transaction }
    );

    // Loop through best practices and save them
    for (const practice of sample.bestPractices) {
      const bestPractice = await BestPracticeRepository.create(
        {
          visit_id: farmVisit.visit_id,
          practice_name: practice.practice_name,
          image_url: practice.image_url,
          sf_practice_id: practice.sf_practice_id,
          question: practice.question,
          answer: practice.answer,
        },

        { transaction }
      );
    }

    // Commit the transaction
    await transaction.commit();

    logger.info(
      `Farm visit sample saved successfully for visit ID: ${farmVisit.visit_id}`
    );

    return farmVisit;
  } catch (error) {
    if (transaction) await transaction.rollback();

    logger.error(`Error saving farm visit sample: ${error.message}`);
    throw error;
  }
};

// Helper to get the list of projects to sample from
const getProjectsToSample = async () => {
  // Implement the logic
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
