import Projects from "../models/projects.models.mjs";
import path, { parse } from "path";
import fs from "fs";
import { getDirName } from "../utils/getDirName.mjs";
import { ParticipantsService } from "../services/participant.service.mjs";
import { ParticipantSyncService } from "../services/participantSync.service.mjs";
import { StagedUploadService } from "../services/stagedUpload.service.mjs";
import { runOutboxForProject } from "../cron-jobs/stagedSync.mjs";

const ParticipantsResolvers = {
  Query: {
    getParticipantsByProject: async (_, { project_id }, { sf_conn }) => {
      try {
        console.log("Fetching participants for project:", project_id);

        const project = await Projects.findOne({
          where: { sf_project_id: project_id, attendance_full: true },
        });

        if (project) {
          console.log("Using real-time sync for SPECIAL_USER project");
          // Ensure SPECIAL_USER edits are applied in real time
          await ParticipantSyncService.syncIncremental(sf_conn, project_id);

          // Then return Postgres‐cached participants
          return await ParticipantsService.getParticipantsByProject(project_id);
        } else {
          console.log("Using standard sync for project:", project_id);

          const result = await ParticipantsService.fetchAndCacheParticipants(
            sf_conn,
            project_id
          );

          return result; // Return the standardized response directly
        }
      } catch (err) {
        console.error(err);
        return {
          message: "An error occurred while fetching participants",
          status: 500,
          participants: [],
        };
      }
    },

    getParticipantsByGroup: async (_, { tg_id }, { sf_conn }) => {
      try {
        const result = await ParticipantsService.fetchTGParticipants(
          sf_conn,
          tg_id
        );
        return result;
      } catch (err) {
        console.error(err);
        return {
          message: "An error occurred while fetching participants",
          status: 500,
          participants: [],
        };
      }
    },

    getParticipantsById: async (_, { p_id }, { sf_conn }) => {
      try {
        const result = await ParticipantsService.fetchParticipant(
          sf_conn,
          p_id
        );
        return result;
      } catch (err) {
        console.error(err);
        return {
          message: "An error occurred while fetching participants",
          status: 500,
          participants: [],
        };
      }
    },
  },

  Mutation: {
    uploadParticipants: async (_, { parts_file, project_id }, { sf_conn }) => {
      try {
        const obj = await parts_file;
        const { filename, createReadStream } = obj.file;

        // File Handling
        const stream = createReadStream();
        const ext = parse(filename).ext;
        if (!validateFileType(ext)) {
          return {
            message: "File must be a csv",
            status: 400,
          };
        }

        const buffer = await new Promise((resolve, reject) => {
          const s = createReadStream();
          const chunks = [];
          s.on("data", (c) => chunks.push(c));
          s.on("end", () => resolve(Buffer.concat(chunks)));
          s.on("error", reject);
        });

        // Save CSV so we can reference it later
        const uploadsDir = path.join(
          getDirName(import.meta.url),
          "../../uploads"
        );
        if (!fs.existsSync(uploadsDir))
          fs.mkdirSync(uploadsDir, { recursive: true });

        const safeName = filename.replace(/[^a-z0-9._-]/gi, "_");
        const savedName = `${Date.now()}-${safeName}`;
        const absPath = path.join(uploadsDir, savedName);
        await fs.promises.writeFile(absPath, buffer);

        // Public URL (served by server.mjs static handler)
        const fileUrl = `/uploads/${savedName}`;

        // Hand the file info to the service
        const result = await StagedUploadService.ingestCsvBufferForPilot(
          buffer,
          project_id,
          sf_conn,
          {
            fileUrl,
            fileName: filename,
            fileBytes: buffer.length,
            mimeType: "text/csv",
          }
        );

        // Call ParticipantSyncService to handle the staged sync

        runOutboxForProject(project_id, sf_conn);

        if (result.status === 200) {
          return { message: result.message, status: 200 };
        } else {
          return {
            message: result.message,
            status: result.status,
            file: result.file || null,
          };
        }
      } catch (error) {
        console.error("Error uploading participants:", error);
        // Handle specific error cases
        return {
          message: error.message || "Unknow error occured",
          status: error.status || 500,
          file: error.file || "",
        };
      }
    },

    syncParticipantsWithCOMMCARE: async (_, { project_id }, { sf_conn }) => {
      try {
        console.log("Start here");
        // check if project exists by project_id
        const project = await Projects.findOne({
          where: { sf_project_id: project_id },
        });

        console.log(project);

        if (!project) {
          return {
            message: "Project not found",
            status: 404,
          };
        }

        console.log(project);

        let participants = [];

        // Perform the initial query
        let result = await sf_conn.query(
          "SELECT Id, Name, Create_In_CommCare__c, Resend_to_OpenFN__c FROM Participant__c WHERE Project__c = '" +
            project.project_name +
            "'"
        );

        participants = participants.concat(result.records);

        // Check if there are more records to retrieve
        while (result.done === false) {
          // Use queryMore to retrieve additional records
          result = await sf_conn.queryMore(result.nextRecordsUrl);
          participants = participants.concat(result.records);
        }

        // Update the Create_In_CommCare__c field to TRUE for all participants
        participants = participants.map((participant) => {
          return {
            Id: participant.Id,
            Resend_to_OpenFN__c: false,
            Create_In_CommCare__c: true, // Assuming Create_In_CommCare__c is a checkbox
          };
        });

        // Split participants into chunks
        const batchSize = 50;
        const participantChunks = [];
        for (let i = 0; i < participants.length; i += batchSize) {
          participantChunks.push(participants.slice(i, i + batchSize));
        }

        // Process participant chunks in parallel
        await Promise.all(
          participantChunks.map(async (chunk) => {
            const updateResult = await new Promise((resolve, reject) => {
              sf_conn
                .sobject("Participant__c")
                .update(chunk, (updateErr, updateResult) => {
                  console.log(updateErr);
                  if (updateErr) {
                    reject({ status: 500 });
                  } else {
                    resolve({
                      data: updateResult,
                      status: 200,
                    });
                  }
                });
            });

            if (updateResult.length > 0) {
              const success = updateResult.every(
                (result) => result.success === true
              );

              if (!success) {
                console.error("Some records failed to update");
                throw new Error("Failed to sync participants");
              }
            }
          })
        );

        console.log("All records updated successfully");
        return { message: "Participants synced successfully", status: 200 };
      } catch (error) {
        console.error(error);
        return { message: "Error syncing participants", status: 500 };
      }
    },
  },
};

function validateFileType(ext) {
  return ext === ".csv";
}

export default ParticipantsResolvers;
