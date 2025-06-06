import Projects from "../models/projects.models.mjs";
import { TsSampleRepository } from "../repositories/ts_sample.repository.mjs";
import { TSessionService } from "../services/tsessions.service.mjs";
import fetchImage from "../utils/commCareApi.mjs";
import { ReportGeneratorService } from "../services/excel.service.mjs";

const TrainingSessionsResolvers = {
  Query: {
    trainingSessionsByProject: async (_, { sf_project_id }, { sf_conn }) => {
      try {
        const project = await Projects.findOne({
          where: { sf_project_id },
        });

        if (!project) {
          return {
            message: "Project not found",
            status: 404,
          };
        }

        const project_name = project.dataValues.project_name;

        let training_sessions = [];

        // get training sessions
        let result = await sf_conn.query(
          `SELECT Id, Name, Module_Name__c, Training_Group__r.Name, Training_Group__r.TNS_Id__c, 
            Session_Status__c, Male_Attendance__c, Female_Attendance__c, Trainer__r.Name, 
            Project_Name__c, Session_Photo_URL__c, Session_Image_Status__c, Verified__c, Date__c,
            Male_Count_Light_Full__c, Female_Count_Light_Full__c
           FROM Training_Session__c 
           WHERE Training_Group__r.Group_Status__c='Active' AND Project_Name__c = '${project_name}' ORDER BY Date__c DESC`
        );

        training_sessions = training_sessions.concat(result.records);

        // Check if there are more records to retrieve
        while (result.done === false) {
          // Use queryMore to retrieve additional records
          result = await sf_conn.queryMore(result.nextRecordsUrl);
          training_sessions = training_sessions.concat(result.records);
        }

        // check if training sessions exist
        if (training_sessions.totalSize === 0) {
          return {
            message: "Training sessions not found",
            status: 404,
          };
        }

        return {
          message: "Training sessions fetched successfully",
          status: 200,
          trainingSessions: training_sessions.map(async (training_session) => {
            return {
              ts_id: training_session.Id,
              ts_name: training_session.Name,
              ts_module: training_session.Module_Name__c,
              ts_group: training_session.Training_Group__r.Name,
              tns_id: training_session.Training_Group__r.TNS_Id__c,
              farmer_trainer: training_session.Trainer__r
                ? training_session.Trainer__r.Name
                : null,
              ts_status: training_session.Session_Status__c,
              total_males:
                training_session.Male_Attendance__c ||
                training_session.Male_Count_Light_Full__c ||
                0,
              total_females:
                training_session.Female_Attendance__c ||
                training_session.Female_Count_Light_Full__c ||
                0,
              has_image: training_session.Session_Photo_URL__c ? true : false,
              session_image_status:
                training_session.Session_Image_Status__c || "not_verified",
              is_verified: training_session.Verified__c,
              session_date: training_session.Date__c,
            };
          }),
        };
      } catch (err) {
        console.log(err);

        return {
          message: err.message,
          status: err.status,
        };
      }
    },

    trainingSessionsByGroup: async (_, { tg_id }, { sf_conn }) => {
      try {
        // check if group exists in soql query
        const group = await sf_conn.query(
          `SELECT Id FROM Training_Group__c WHERE Id = '${tg_id}'`
        );

        if (group.totalSize === 0) {
          return {
            message: "Group not found",
            status: 404,
          };
        }

        // get training sessions
        const training_sessions = await sf_conn.query(
          `SELECT Id, Name, Module_Name__c, Training_Group__c, Training_Group__r.TNS_Id__c, Session_Status__c, Male_Attendance__c, Female_Attendance__c, Trainer__r.Name, Session_Photo_URL__c, Session_Image_Status__c, Verified__c, Date__c FROM Training_Session__c WHERE Training_Group__r.Group_Status__c='Active' AND Training_Group__r.Id = '${tg_id}'`
        );

        // check if training sessions exist
        if (training_sessions.totalSize === 0) {
          return {
            message: "Training sessions not found",
            status: 404,
          };
        }

        return {
          message: "Training sessions fetched successfully",
          status: 200,
          trainingSessions: training_sessions.records.map(
            (training_session) => {
              return {
                ts_id: training_session.Id,
                ts_name: training_session.Name,
                ts_module: training_session.Module_Name__c,
                farmer_trainer: training_session.Trainer__r
                  ? training_session.Trainer__r.Name
                  : null,
                ts_status: training_session.Session_Status__c,
                total_males: training_session.Male_Attendance__c || 0,
                total_females: training_session.Female_Attendance__c || 0,
                has_image: training_session.Session_Photo_URL__c ? true : false,
                session_image_status:
                  training_session.Session_Image_Status__c || "not_verified",
                is_verified: training_session.Verified__c,
                session_date: training_session.Date__c,
              };
            }
          ),
        };
      } catch (err) {
        console.log(err);

        return {
          message: err.message,
          status: err.status,
        };
      }
    },

    trainingSessionImage: async (_, { ts_id }, { sf_conn }) => {
      try {
        // check if training session exists in soql query
        const training_session = await sf_conn.query(
          `SELECT Id, Session_Photo_URL__c FROM Training_Session__c WHERE Id = '${ts_id}'`
        );

        if (training_session.totalSize === 0) {
          return {
            message: "Training session not found",
            status: 404,
          };
        }

        const session_image = training_session.records[0].Session_Photo_URL__c;
        const base64encodedData = session_image
          ? await fetchImage(session_image)
          : null;

        return {
          message: "Training session image fetched successfully",
          status: 200,
          trainingSessionImage: base64encodedData,
        };
      } catch (err) {
        console.log(err);

        return {
          message: err.message,
          status: err.status,
        };
      }
    },

    sampledTrainingSessions: async (_, { sf_project_id }) => {
      return TSessionService.getSampledSessions(sf_project_id);
    },

    generateTSApprovalReport: async (
      _,
      { projectId, startDate, endDate, status }
    ) => {
      try {
        // Step 1: Fetch the farm visit statistics
        const sampledRecords = await TSessionService.getStatsByFT(
          projectId,
          startDate,
          endDate,
          status
        );

        // Step 2: Generate the Excel report as Base64
        const base64Report =
          await ReportGeneratorService.generateSampledTSReport(sampledRecords);
        // Step 3: Return the Base64 report
        return {
          message: "TS report generated successfully",
          status: 200,
          file: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64Report}`,
        };
      } catch (err) {
        console.error("Error generating TS report:", err);
        return {
          message: "Failed to generate TS report",
          status: 500,
        };
      }
    },
  },

  Mutation: {
    validateSession: async (_, { input }) => {
      try {
        // Use bulkUpdate from the repository for each input
        const updates = input.map((item) => ({
          values: {
            image_review_result: item.status,
            last_reviewed_by: item.userId,
          }, // Fields to update
          where: { id: item.sessionId }, // Where condition using tsId
        }));

        // Perform bulk update
        await TsSampleRepository.bulkUpdate(updates);

        return {
          message: "Training sessions updated successfully",
          status: 200,
        };
      } catch (err) {
        console.log(err);
        return {
          message: err.message,
          status: err.status || 500,
        };
      }
    },
  },
};

export default TrainingSessionsResolvers;
