import logger from "../config/logger.mjs";

export const fetchFarmVisitsFromSalesforce = async (sf_conn, trainerId, lastMonday, lastSunday) => {
  const soqlQuery = `
    SELECT Id, Name, Best_Practice_Adoption__c, Farm_Visit__c,
           Farm_Visit__r.Name, Farm_Visit__r.Training_Group__r.Name,
           Farm_Visit__r.Training_Group__r.TNS_Id__c, Farm_Visit__r.Training_Session__r.Name,
           Farm_Visit__r.Farm_Visited__r.TNS_Id__c, Farm_Visit__r.Farm_Visited__c,
           Farm_Visit__r.Farm_Visited__r.Name, Farm_Visit__r.Household_PIMA_ID__c,
           Farm_Visit__r.Farmer_Trainer__r.Name, Farm_Visit__r.Farmer_Trainer__c,
           Farm_Visit__r.Visit_Has_Training__c, Farm_Visit__r.Date_Visited__c,
           number_of_main_stems_on_majority_trees__c, photo_of_trees_and_average_main_stems__c,
           Main_Stems_Photo_Status__c, health_of_new_planting_choice__c, Color_of_coffee_tree_leaves__c,
           how_many_weeds_under_canopy_and_how_big__c, photo_of_weeds_under_the_canopy__c,
           Weeds_Under_Canopy_Photo_Status__c, take_a_photo_of_erosion_control__c,
           Erosion_Control_Photo_Status__c, level_of_shade_present_on_the_farm__c,
           photo_of_level_of_shade_on_the_plot__c, Level_Of_Shade_Plot_Photo_Status__c,
           planted_intercrop_bananas__c, photograph_intercrop_bananas__c, Intercrop_Bananas_Photo_Status__c,
           do_you_have_a_record_book__c, are_there_records_on_the_record_book__c,
           take_a_photo_of_the_record_book__c, Record_Book_Photo_Status__c,
           Do_you_have_compost_manure__c, photo_of_the_compost_manure__c, Compost_Manure_Photo_Status__c
    FROM FV_Best_Practices__c
    WHERE Farm_Visit__r.Date_Visited__c >= ${lastMonday} AND Farm_Visit__r.Date_Visited__c <= ${lastSunday}
    AND Farm_Visit__r.Farmer_Trainer__c = '${trainerId}'
    ORDER BY Farm_Visit__r.Date_Visited__c ASC LIMIT 2
  `;

  // Step 3: Fetch the data from Salesforce using the connection
  try {
    const result = await sf_conn.query(soqlQuery);
    return result.records;
  } catch (err) {
    logger.error(`Error fetching farm visits: with query ${soqlQuery}`);
    throw new Error("Failed to fetch farm visits");
  }
};

export const fetchFTsFromSalesforceByPId = async (sf_conn, projectId) => {
  try {
    const farmerTrainers = await sf_conn.query(`
      SELECT 
        Id, Staff__c, Staff__r.Name
      FROM Project_Role__c
      WHERE Project__c = '${projectId}' AND Role__c = 'Farmer Trainer'
    `);
    return farmerTrainers.records;
  } catch (error) {
    throw error;
  }
};

export const fetchTrainingGroupsByProjectId = async (sf_conn, project_id) => {
  const groups = await sf_conn.query(
    `SELECT Id FROM Training_Group__c WHERE Project__c = '${project_id}'`
  );

  if (groups.totalSize === 0) {
    throw new Error("Training Groups not found");
  }

  return groups.records.map((group) => group.Id);
};

export const fetchFarmVisitsByTrainingGroups = async (sf_conn, tg_ids) => {
  let farmVisits = [];
  let result = await sf_conn.query(
    `SELECT Id, Training_Group__r.Name, Training_Group__r.TNS_Id__c,
      Farm_Visited__c, Farm_Visited__r.Name, Farm_Visited__r.Last_Name__C, 
      Farm_Visited__r.TNS_Id__c, Farm_Visited__r.Household__c, 
      Farm_Visited__r.Household__r.Household_ID__c, Farmer_Trainer__r.Name, Date_Visited__c  
    FROM Farm_Visit__c 
    WHERE Training_Group__c IN (${tg_ids.map((id) => `'${id}'`).join(", ")})`
  );

  farmVisits = farmVisits.concat(result.records);

  while (!result.done) {
    result = await sf_conn.queryMore(result.nextRecordsUrl);
    farmVisits = farmVisits.concat(result.records);
  }

  if (farmVisits.length === 0) {
    throw new Error("Farm Visits not found");
  }

  return farmVisits;
};