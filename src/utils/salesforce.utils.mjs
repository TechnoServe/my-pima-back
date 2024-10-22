import logger from "../config/logger.mjs";

export const fetchFarmVisitsFromSalesforce = async (
  sf_conn,
  trainerId,
  lastMonday,
  lastSunday
) => {
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

export const fetchRandomTSByFt = async (
  sf_conn,
  projectId,
  ftId,
  lastMonday,
  lastSunday,
  limit
) => {
  const result = await sf_conn.query(
    `SELECT Id, Module_Name__c, Training_Module__c, Training_Group__r.Name, Training_Group__r.TNS_Id__c, 
            Male_Attendance__c, Female_Attendance__c, Trainer__r.Name, 
            Session_Photo_URL__c, Date__c, Number_in_Attendance__c, Location_GPS__Latitude__s, Location_GPS__Longitude__s,
            Female_Count_Light_Full__c, Male_Count_Light_Full__c, Total_Count_Light_Full__c
           FROM Training_Session__c 
           WHERE Training_Group__r.Group_Status__c='Active' 
           AND Date__c >= ${lastMonday} AND Date__c <= ${lastSunday}
           AND Training_Group__r.Project__c = '${projectId}' AND Date__c != NULL
           AND Training_Module__r.Current_Training_Module__c = true
           AND Trainer__r.Id = '${ftId}'
           ORDER BY Date__c DESC 
           LIMIT ${limit}`
  );

  return result.records;
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
  const batchSize = 200;
  if (!tg_ids || tg_ids.length === 0) {
    throw new Error("No Training Group IDs provided");
  }

  let farmVisits = [];

  // Function to query farm visits for a batch of tg_ids
  const queryFarmVisits = async (batchIds) => {
    let result = await sf_conn.query(
      `SELECT Id, Training_Group__r.Name, Training_Group__r.TNS_Id__c,
        Farm_Visited__c, Farm_Visited__r.Name, Farm_Visited__r.Last_Name__C, 
        Farm_Visited__r.TNS_Id__c, Farm_Visited__r.Household__c, 
        Farm_Visited__r.Household__r.Household_ID__c, Farmer_Trainer__r.Name, Date_Visited__c  
      FROM Farm_Visit__c 
      WHERE Training_Group__c IN (${batchIds
        .map((id) => `'${id}'`)
        .join(", ")})`
    );

    let batchVisits = result.records;

    // Handle pagination if the result is not done (fetch more records if needed)
    while (!result.done) {
      result = await sf_conn.queryMore(result.nextRecordsUrl);
      batchVisits = batchVisits.concat(result.records);
    }

    return batchVisits;
  };

  // Split tg_ids into batches and query each batch separately
  for (let i = 0; i < tg_ids.length; i += batchSize) {
    const batchIds = tg_ids.slice(i, i + batchSize);
    try {
      const batchVisits = await queryFarmVisits(batchIds);
      farmVisits = farmVisits.concat(batchVisits);
    } catch (error) {
      logger.error(
        `Error fetching farm visits for batch starting at index ${i}:`,
        error
      );
    }
  }

  // If no visits were found, throw an error
  if (farmVisits.length === 0) {
    throw new Error("Farm Visits not found");
  }

  return farmVisits;
};

// Query TS Sessions by project Id
export const fetchRandomTSByPId = async (
  sf_conn,
  ProjectId,
  sampleSize,
  lastMonday,
  lastSunday
) => {
  let training_sessions = [];

  // Step 1: Get the total number of records
  let countResult = await sf_conn.query(
    `SELECT COUNT() 
     FROM Training_Session__c 
     WHERE Training_Group__r.Group_Status__c='Active' 
     AND Date__c >= ${lastMonday} AND Date__c <= ${lastSunday}
     AND Date__c != NULL
     AND Training_Group__r.Project__c = '${ProjectId}'`
  );

  console.log(sampleSize);
  console.log(`Last week count: ${countResult.totalSize}`);

  const totalRecords = countResult.totalSize;
  const fivePercentCount = Math.ceil((totalRecords * sampleSize) / 100);

  if (totalRecords > fivePercentCount) {
    // Step 3: Generate a random number for OFFSET (ensure it's within the bounds)
    const randomOffset = Math.floor(
      Math.random() * (totalRecords - fivePercentCount)
    );

    // Step 4: Fetch the random subset of records using LIMIT and OFFSET
    let result = await sf_conn.query(
      `SELECT Id, Module_Name__c, Training_Module__c, Training_Group__r.Name, Training_Group__r.TNS_Id__c, 
              Male_Attendance__c, Female_Attendance__c, Trainer__r.Name, 
              Session_Photo_URL__c, Date__c, Number_in_Attendance__c, Location_GPS__Latitude__s, Location_GPS__Longitude__s,
              Female_Count_Light_Full__c, Male_Count_Light_Full__c, Total_Count_Light_Full__c
             FROM Training_Session__c 
             WHERE Training_Group__r.Group_Status__c='Active' 
             AND Date__c >= ${lastMonday} AND Date__c <= ${lastSunday}
             AND Training_Group__r.Project__c = '${ProjectId}' AND Date__c != NULL
             AND Training_Module__r.Current_Training_Module__c = true
             ORDER BY Date__c DESC 
             LIMIT ${fivePercentCount} 
             OFFSET ${randomOffset}`
    );

    training_sessions = training_sessions.concat(result.records);
  } else {
    // If there are fewer records than 5%, just fetch all
    let result = await sf_conn.query(
      `SELECT Id, Module_Name__c, Training_Module__c, Training_Group__r.Name, Training_Group__r.TNS_Id__c, 
              Male_Attendance__c, Female_Attendance__c, Trainer__r.Name, 
              Session_Photo_URL__c, Date__c, Number_in_Attendance__c, Location_GPS__Latitude__s, Location_GPS__Longitude__s,
              Female_Count_Light_Full__c, Male_Count_Light_Full__c, Total_Count_Light_Full__c
             FROM Training_Session__c 
             WHERE Training_Group__r.Group_Status__c='Active' 
             AND Date__c >= ${lastMonday} AND Date__c <= ${lastSunday}
             AND Training_Group__r.Project__c = '${ProjectId}' AND Date__c != NULL
             AND Training_Module__r.Current_Training_Module__c = true
             ORDER BY Date__c DESC `
    );

    training_sessions = training_sessions.concat(result.records);
  }

  console.log(`Sampled: ${training_sessions.length}`);

  return training_sessions;
};
