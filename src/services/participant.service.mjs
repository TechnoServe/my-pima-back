import Projects from "../models/projects.models.mjs";
import Participant from "../models/participant.model.mjs";
import redis from "../config/redisClient.mjs"; // Import the Redis client

function mapRowToDto(p) {
  return {
    p_id: p.salesforceId,
    first_name: p.firstName || "",
    middle_name: p.middleName || "",
    last_name: p.lastName || "",
    age: p.age ?? null,

    // Farm_Size__c -> coffee_tree_numbers
    coffee_tree_numbers: p.coffeeTreeNumbers ?? null,

    // Household__r.Name -> hh_number
    hh_number: p.hhNumber ?? null,

    // Training_Group__r.TNS_Id__c -> ffg_id
    ffg_id: p.ffgId || "",

    gender: p.gender || "",
    location: p.location || "N/A",

    // TNS_Id__c -> tns_id
    tns_id: p.tnsId || "",

    status: p.status || "",

    farmer_trainer: p.farmerTrainer || "",
    business_advisor: p.businessAdvisor || null,

    // Project__c -> project_name
    project_name: p.projectName || "",

    // Training_Group__c -> training_group
    training_group: p.trainingGroup || "",

    // Household__c -> household_id
    household_id: p.householdId || null,

    // Primary_Household_Member__c -> 1 | 2
    primary_household_member: p.primaryHouseholdMember ?? null,

    // Create_In_CommCare__c
    create_in_commcare: p.createInCommcare === true,

    // Other_ID_Number__c -> coop_membership_number (or national id depending on project in FE)
    coop_membership_number: p.otherIdNumber || "",

    phone_number: p.phoneNumber || "",

    // Number_of_Coffee_Plots__c (with fallback already handled during sync)
    number_of_coffee_plots: p.numberOfCoffeePlots ?? null,
  };
}

export const ParticipantsService = {
  async getParticipantsByProject(projectId) {
    try {
      const rows = await Participant.findAll({
        where: { projectId },
        order: [
          ["tns_id", "ASC"],
          ["hh_number", "ASC"],
        ],
      });

      if (!rows || rows.length === 0) {
        return {
          message: "Participants not found",
          status: 404,
          participants: [],
        };
      }

      const participants = rows.map(mapRowToDto);
      return {
        message: "Participants fetched successfully",
        status: 200,
        participants,
      };
    } catch (err) {
      console.error("getParticipantsByProject error:", err);
      return {
        message: "Failed to fetch participants",
        status: 500,
        participants: [],
      };
    }
  },

  async fetchAndCacheParticipants(conn, projectId) {
    const cacheKey = `participants:${projectId}`;

    try {
      // First, check the cache
      // const cachedData = await redis.get(cacheKey);

      // if (cachedData) {
      //   const parsedData = JSON.parse(cachedData);
      //   console.log(
      //     `${parsedData.participants.length} participants for project ${projectId} retrieved from cache`
      //   );
      //   return parsedData;
      // }

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

      let status = "";

      if (project.sf_project_id === "a0EOj000003TZQTMA4") {
        status = " AND Status__c = 'Inactive' ";
      } else {
        status = " AND Status__c = 'Active' ";
      }

      // Fetch participants from Salesforce
      let participants = [];

      const soql = `
        SELECT Id, Name, Middle_Name__c, Last_Name__c, Gender__c, Age__c, 
          Household__r.Farm_Size__c, Household__r.Name, Training_Group__r.TNS_Id__c, 
          Training_Group__r.Project_Location__c, TNS_Id__c, Status__c, Trainer_Name__c, 
          Project__c, Training_Group__c, Training_Group__r.Responsible_Staff__r.ReportsToId, 
          Household__c, Primary_Household_Member__c, Create_In_CommCare__c, Other_ID_Number__c, 
          Phone_Number__c, Number_of_Coffee_Plots__c, Household__r.Number_of_Coffee_Plots__c, 
          Training_Group__r.Location__r.Name, Training_Group__r.Project__r.Project_Country__c
        FROM Participant__c 
        WHERE Project__c = '${project.project_name}'
          ${status} 
        ORDER BY TNS_Id__c Asc, Household__r.Name Asc
      `;

      console.log(soql);
      let result = await conn.query(soql);

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
            participant.Training_Group__r?.Project__r?.Project_Country__c ===
            "a072400000eenMpAAI"
              ? participant.Training_Group__r?.Location__r.Name
              : locations.records.find(
                  (location) =>
                    location.Id ===
                    participant.Training_Group__r.Project_Location__c
                )?.Location__r?.Name || "N/A",
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
      // await redis.set(cacheKey, JSON.stringify(response), "EX", 3600);
      // console.log(`Participants data for project ${projectId} cached`);

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

  async fetchTGParticipants(conn, tgId) {
    try {
      // Fetch participants from Salesforce
      let participants = [];
      let result = await conn.query(`
        SELECT Id, Name, Middle_Name__c, Last_Name__c, Gender__c, Age__c, 
          Household__r.Farm_Size__c, Household__r.Name, Training_Group__r.TNS_Id__c, 
          Training_Group__r.Project_Location__c, TNS_Id__c, Status__c, Trainer_Name__c, 
          Project__c, Training_Group__c, Training_Group__r.Responsible_Staff__r.ReportsToId, 
          Household__c, Primary_Household_Member__c, Create_In_CommCare__c, Other_ID_Number__c, 
          Phone_Number__c, Number_of_Coffee_Plots__c, Household__r.Number_of_Coffee_Plots__c
        FROM Participant__c 
        WHERE Status__c = 'Active' AND Training_Group__c = '${tgId}'
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

  async fetchParticipant(conn, pId) {
    try {
      // Fetch a single participant from Salesforce by pId
      const result = await conn.query(`
        SELECT Id, Name, Middle_Name__c, Last_Name__c, Gender__c, Age__c, 
          Household__r.Farm_Size__c, Household__r.Name, Training_Group__r.TNS_Id__c, 
          Training_Group__r.Project_Location__c, TNS_Id__c, Status__c, Trainer_Name__c, 
          Project__c, Training_Group__c, Training_Group__r.Responsible_Staff__r.ReportsToId, 
          Household__c, Primary_Household_Member__c, Create_In_CommCare__c, Other_ID_Number__c, 
          Phone_Number__c, Number_of_Coffee_Plots__c, Household__r.Number_of_Coffee_Plots__c
        FROM Participant__c 
        WHERE Status__c = 'Active' AND Id = '${pId}'
      `);

      // If no records found, return a 404 response
      if (result.records.length === 0) {
        const response = {
          message: "Participant not found",
          status: 404,
          participant: null,
        };
        return response;
      }

      const participant = result.records[0];

      // Additional data fetching
      const [locations, reportsTo] = await Promise.all([
        conn.query(`SELECT Id, Location__r.Name FROM Project_Location__c`),
        conn.query(`SELECT Id, Name FROM Contact`),
      ]);

      // Process the participant data
      const participantData = {
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
              location.Id === participant.Training_Group__r.Project_Location__c
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

      // Return a successful response with the participant data
      const response = {
        message: "Participant fetched successfully",
        status: 200,
        participant: participantData,
      };

      return response;
    } catch (err) {
      console.error(err);
      return {
        message: "Failed to fetch participant",
        status: 500,
        participant: null,
      };
    }
  },
};
