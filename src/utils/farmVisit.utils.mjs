import { fetchFarmVisitsFromSalesforce } from "./salesforceUtils.mjs";
import FarmVisits from "../models/farm_visit.model.mjs";
import BestPractices from "../models/best_practices.model.mjs";

// Function to sample farm visits
export const sampleFarmVisitsForProjects = async (project, trainer, samplingPeriod) => {
  // Logic to fetch farm visits from Salesforce that happened in the sampling period (previous week)
  const query = `
    SELECT Id, Date_Visited__c, Farmer_Trainer__c, Best_Practice_Adoption__c, 
    photo_of_trees_and_average_main_stems__c, Weeds_Under_Canopy_Photo_Status__c, ...
    FROM Farm_Visit__c
    WHERE Farmer_Trainer__c = '${trainer.Id}' 
    AND Date_Visited__c = LAST_WEEK
  `;
  
  const farmVisits = await fetchFarmVisitsFromSalesforce(query);

  // Logic to decide whether to select all or only some visits
  let sampledVisits;
  if (project.sample_all_visits) {
    sampledVisits = farmVisits;
  } else {
    // Select a sample of visits for this farmer trainer
    const sampleSize = Math.min(farmVisits.length, project.sample_size || 5); // For example, max 5 visits
    sampledVisits = farmVisits.slice(0, sampleSize);
  }

  return sampledVisits;
};

// Function to save farm visits and best practices in Postgres
export const saveFarmVisitSample = async (visit, project, trainer, transaction) => {
  const farmVisitData = {
    farm_visit_id: visit.Id,
    project_id: project.sf_project_id,
    farmer_trainer_id: trainer.Id,
    date_sampled: new Date(),
    status: 'unreviewed',  // Default to unreviewed when first sampled
    overall_review_status: 'unreviewed',
    last_reviewed_by: null  // Will be populated when reviewed
  };

  // Save the farm visit
  const savedVisit = await FarmVisits.create(farmVisitData, { transaction });

  // Store best practices for the farm visit
  const bestPractices = mapBestPracticesFromVisit(visit);
  for (const practice of bestPractices) {
    await BestPractices.create({
      farm_visit_id: savedVisit.farm_visit_id,
      practice_name: practice.name,
      status: 'unreviewed',
      correct_answer: null,
      comment: null,
      picture_url: practice.picture_url
    }, { transaction });
  }
};

// Helper function to map best practices from Salesforce farm visit object
const mapBestPracticesFromVisit = (visit) => {
  return [
    {
      name: 'Main Stems',
      picture_url: visit.photo_of_trees_and_average_main_stems__c,
      status: visit.Main_Stems_Photo_Status__c || 'not_verified',
    },
    {
      name: 'Weeds Under Canopy',
      picture_url: visit.photo_of_weeds_under_the_canopy__c,
      status: visit.Weeds_Under_Canopy_Photo_Status__c || 'not_verified',
    },
    // Add mappings for other best practices
  ];
};
