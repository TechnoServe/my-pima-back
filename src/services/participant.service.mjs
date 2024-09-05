import Projects from "../models/projects.models.mjs";
import redis from "../config/redisClient.mjs"; // Import the Redis client

export const ParticipantsService = {
  async fetchAndCacheParticipants(conn, projectId) {
    const cacheKey = `participants:${projectId}`;

    try {
      // First, check the cache
      const cachedData = await redis.get(cacheKey);

      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        console.log(
          `${parsedData.participants.length} participants for project ${projectId} retrieved from cache`
        );
        return parsedData;
      }

      // If no cache, check if the project exists in your local database
      const project = await Projects.findOne({
        where: { sf_project_id: projectId },
      });

      if (!project) {
        const response = {
          message: "Project not found",
          status: 404,
          participants: [],
        };
        await redis.set(cacheKey, JSON.stringify(response), "EX", 3600); // Cache the not-found response
        return response;
      }

      // Fetch participants from Salesforce
      let participants = [];
      let result = await conn.query(`
        SELECT Id, Name, Middle_Name__c, Last_Name__c, Gender__c, Age__c, 
          Household__r.Farm_Size__c, Household__r.Name, Training_Group__r.TNS_Id__c, 
          Training_Group__r.Project_Location__c, TNS_Id__c, Status__c, Trainer_Name__c, 
          Project__c, Training_Group__c, Training_Group__r.Responsible_Staff__r.ReportsToId, 
          Household__c, Primary_Household_Member__c, Create_In_CommCare__c, Other_ID_Number__c, 
          Phone_Number__c, Number_of_Coffee_Plots__c FROM Participant__c 
        WHERE Project__c = '${project.project_name}' AND Status__c = 'Active' 
        ORDER BY TNS_Id__c Asc, Household__r.Name Asc
      `);

      participants = participants.concat(result.records);

      while (!result.done) {
        result = await conn.queryMore(result.nextRecordsUrl);
        participants = participants.concat(result.records);
      }

      if (participants.length === 0) {
        const response = {
          message: "Participants not found",
          status: 404,
          participants: [],
        };
        await redis.set(cacheKey, JSON.stringify(response), "EX", 3600); // Cache the empty result
        return response;
      }

      // Additional data fetching
      const [locations, reportsTo] = await Promise.all([
        conn.query(`SELECT Id, Location__r.Name FROM Project_Location__c`),
        conn.query(`SELECT Id, Name FROM Contact`),
      ]);

      // Process participants data
      const participantsData = participants.map((participant) => {
        return {
          p_id: participant.Id,
          first_name: participant.Name,
          middle_name: participant.Middle_Name__c,
          last_name: participant.Last_Name__c,
          age: participant.Age__c,
          coffee_tree_numbers: participant.Household__c
            ? participant.Household__r.Farm_Size__c
            : null,
          hh_number: participant.Household__c
            ? participant.Household__r.Name
            : null,
          ffg_id: participant.Training_Group__r.TNS_Id__c,
          gender: participant.Gender__c,
          location:
            locations.records.find(
              (location) =>
                location.Id ===
                participant.Training_Group__r.Project_Location__c
            )?.Location__r.Name || "N/A",
          tns_id: participant.TNS_Id__c,
          status: participant.Status__c,
          farmer_trainer: participant.Trainer_Name__c,
          business_advisor:
            reportsTo.records.find(
              (contact) =>
                contact.Id ===
                participant.Training_Group__r.Responsible_Staff__r.ReportsToId
            )?.Name || null,
          project_name: participant.Project__c,
          training_group: participant.Training_Group__c,
          household_id: participant.Household__c,
          primary_household_member:
            participant.Primary_Household_Member__c === "Yes" ? 1 : 2,
          create_in_commcare: participant.Create_In_CommCare__c,
          coop_membership_number: participant.Other_ID_Number__c,
          phone_number: participant.Phone_Number__c,
          number_of_coffee_plots: participant.Household__c
            ? participant.Household__r.Number_of_Coffee_Plots__c === "null" ||
              participant.Household__r.Number_of_Coffee_Plots__c === "" ||
              participant.Household__r.Number_of_Coffee_Plots__c === null
              ? participant.Number_of_Coffee_Plots__c
              : participant.Household__r.Number_of_Coffee_Plots__c
            : "ERROR HERE! Please report to the PIMA team",
        };
      });

      const response = {
        message: "Participants fetched successfully",
        status: 200,
        participants: participantsData,
      };

      // Cache the response for future use
      await redis.set(cacheKey, JSON.stringify(response), "EX", 3600);
      console.log(`Participants data for project ${projectId} cached`);

      return response;
    } catch (err) {
      console.error(err);
      return {
        message: "Failed to fetch participants",
        status: 500,
        participants: [],
      };
    }
  },
};
