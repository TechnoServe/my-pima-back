import Projects from "../models/projects.models.mjs";
import { join, parse } from "path";
import fs, { createWriteStream } from "fs";
import { getDirName } from "../utils/getDirName.mjs";
import ExcelJS from "exceljs";
import { ParticipantsService } from "../services/participant.service.mjs";

const ParticipantsResolvers = {
  Query: {
    getParticipantsByProject: async (_, { project_id }, { sf_conn }) => {
      try {
        const result = await ParticipantsService.fetchAndCacheParticipants(
          sf_conn,
          project_id
        );
        return result; // Return the standardized response directly
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
        // check if training group exists by tg_id
        const training_group = await sf_conn.query(
          `SELECT Id FROM Training_Group__c WHERE Id = '${tg_id}'`
        );

        if (training_group.totalSize === 0) {
          return {
            message: "Training Group not found",
            status: 404,
          };
        }

        const participants = await sf_conn.query(
          "SELECT Id, Participant_Full_Name__c, Gender__c, Location__c, TNS_Id__c, Status__c, Trainer_Name__c, Project__c, Training_Group__c, Training_Group__r.Responsible_Staff__r.ReportsToId, Household__c, Primary_Household_Member__c FROM Participant__c WHERE Training_Group__c = '" +
            tg_id +
            "'"
        );

        if (participants.totalSize === 0) {
          return {
            message: "Participants not found",
            status: 404,
          };
        }

        const res1 = await sf_conn.query(
          `SELECT Id, Location__r.Name FROM Project_Location__c`,
          async function (err, result) {
            if (err) {
              console.error(err);

              return {
                message: err.message,
                status: 500,
              };
            }

            return result;
          }
        );

        const reportsTo = await sf_conn.query(
          `SELECT Id, Name FROM Contact`,
          async function (err, result) {
            if (err) {
              console.error(err);

              return {
                message: err.message,
                status: 500,
              };
            }

            return result;
          }
        );

        return {
          message: "Participants fetched successfully",
          status: 200,
          participants: participants.records.map(async (participant) => {
            return {
              p_id: participant.Id,
              full_name: participant.Participant_Full_Name__c,
              gender: participant.Gender__c,
              location:
                res1.records.find(
                  (location) =>
                    location.Id ===
                    participant.Training_Group__r.Project_Location__c
                ) === undefined
                  ? "N/A"
                  : res1.records.find(
                      (location) =>
                        location.Id ===
                        participant.Training_Group__r.Project_Location__c
                    ).Location__r.Name,
              tns_id: participant.TNS_Id__c,
              status: participant.Status__c,
              farmer_trainer: participant.Trainer_Name__c,
              business_advisor:
                reportsTo.records.find(
                  (contact) =>
                    contact.Id ===
                    participant.Training_Group__r.Responsible_Staff__r
                      .ReportsToId
                ) === undefined
                  ? null
                  : reportsTo.records.find(
                      (contact) =>
                        contact.Id ===
                        participant.Training_Group__r.Responsible_Staff__r
                          .ReportsToId
                    ).Name,
              project_name: participant.Project__c,
              training_group: participant.Training_Group__c,
              household_id: participant.Household__c,
              primary_household_member: participant.Primary_Household_Member__c,
            };
          }),
        };
      } catch (error) {
        console.log(error);

        return {
          message: error.message,
          status: error.status,
        };
      }
    },
  },

  Mutation: {
    uploadParticipants: async (_, { parts_file }, { sf_conn }) => {
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
        const fileData = await readFileData(stream);

        // Data Processing
        console.log("Processing data.................");
        const formattedHHData = formatHHData(fileData);
        const groupedHHData = await groupDataByHousehold(formattedHHData);

        if (groupedHHData.status == 500) {
          throw groupedHHData;
        }

        const trainingGroupsMap = await matchFFGsWithSalesforceIds(
          sf_conn,
          groupedHHData
        );

        // console.log("trainingGroupsMap", trainingGroupsMap);
        console.log("Updating households.................");
        const hhResult = await updateHouseholdsInSalesforce(
          sf_conn,
          groupedHHData,
          trainingGroupsMap
        );

        // query most recent household data after update
        const recentHHData = await queryRecentHHData(sf_conn, hhResult);

        const formattedPartData = formatParticipantData(
          fileData,
          trainingGroupsMap,
          recentHHData
        );

        console.log(formattedPartData.slice(0, 2));

        console.log("Updating Participants.................");
        const partsResult = await updateParticipantsInSalesforce(
          sf_conn,
          formattedPartData
        );

        if (partsResult.status == 200) {
          // console.log("Updating Attendance.................");
          // const attendance = await updateAttendance(fileData, sf_conn);

          // File Writing
          // const newFilename = await writeUploadedFile(stream, ext);

          // if (attendance.status == 200) {
          return {
            message: "Participants uploaded successfully",
            status: 200,
            //filename: newFilename,
          };
          // } else {
          //   throw {
          //     status: attendance.status || 500,
          //     message:
          //       attendance.message ||
          //       "An unkown error occured. Please contact the PIMA team.",
          //   };
          // }
        } else {
          throw {
            status: partsResult.status || 500,
            message:
              partsResult.message ||
              "An unkown error occured. Please contact the PIMA team.",
          };
        }

        // console.log("hh result", hhResult);
      } catch (error) {
        // Handle specific error cases
        return {
          message: error.message || "Unknow error occured",
          status: error.status || 500,
          file: error.file || "",
        };
      }
    },

    uploadParticipant: async (_, { parts_file }, { sf_conn }) => {
      try {
        const obj = await parts_file;

        const { filename, createReadStream } = obj.file;

        // Invoking the `createReadStream` will return a Readable Stream.
        let stream = createReadStream();

        let { ext } = parse(filename);

        // check if file is csv
        if (ext !== ".csv") {
          return {
            message: "File must be a csv",
            status: 400,
          };
        }

        // read file data
        const chunks = [];
        stream.on("data", (chunk) => {
          chunks.push(chunk);
        });

        const streamEndPromise = new Promise((resolve, reject) => {
          stream.on("end", async () => {
            const HEADER_MAPPING = {
              hh_number: "Household_Number__c",
              first_name: "Name",
              middle_name: "Middle_Name__c",
              last_name: "Last_Name__c",
              sf_household_id: "Household__c",
              farmer_number: "Primary_Household_Member__c",
              tns_id: "TNS_Id__c",
              gender: "Gender__c",
              age: "Age__c",
              "Phone Number": "Phone_Number__c",
              coffee_tree_numbers: "Farm_Size__c",
              ffg_id: "ffg_id",
              status: "Status__c",
              farmer_sf_id: "Participant__c",
            };

            const REQUIRED_COLUMNS = [
              "Farm_Size__c",
              "ffg_id",
              "Household_Number__c",
              "Primary_Household_Member__c",
              "Household__c",
            ];

            const fileData = Buffer.concat(chunks);
            const rows = fileData.toString().split("\n");

            const header = rows[0]
              .split(",")
              .map((value) => HEADER_MAPPING[value] || value);

            const columnIndexMap = REQUIRED_COLUMNS.reduce((map, column) => {
              map[column] = header.indexOf(column);
              return map;
            }, {});

            const formattedData = rows.slice(1).map((row) => {
              if (row.trim() !== "") {
                const values = row.split(",");
                const formattedRow = {};

                REQUIRED_COLUMNS.forEach((column) => {
                  const index = columnIndexMap[column];
                  const value = values[index].replace(/"/g, "");

                  if (
                    column === "Primary_Household_Member__c" &&
                    (value === "1" || value === "2")
                  ) {
                    formattedRow[column] = value === "1" ? "Yes" : "No";
                  } else if (column === "Farm_Size__c" && value === "null") {
                    formattedRow[column] = "";
                  } else {
                    formattedRow[column] = value;
                  }
                });

                // Check if Household_Number__c is less than 10
                if (
                  parseInt(values[columnIndexMap["Household_Number__c"]], 10) <
                  10
                ) {
                  // Prepend '0' to formattedRow["Name"]
                  formattedRow["Name"] =
                    "0" +
                    values[columnIndexMap["Household_Number__c"]].replace(
                      /"/g,
                      ""
                    );
                } else {
                  // If Household_Number__c is 10 or greater, directly assign the value to formattedRow["Name"]
                  formattedRow["Name"] = values[
                    columnIndexMap["Household_Number__c"]
                  ].replace(/"/g, "");
                }
                formattedRow["Name"] = values[
                  columnIndexMap["Household_Number__c"]
                ].replace(/"/g, "");

                return formattedRow;
              }
            });

            console.log("Total Uploaded Records: ", formattedData.length);
            console.log("Sample formatted data", formattedData.slice(0, 2));

            // group data by Household_Number__c and take the row with Primary_Household_Member__c = 'Yes', and get total number of rows in each group and assign total number to Number_of_Members__c
            const groupedData = formattedData
              .filter((item) => item !== undefined)
              .reduce((acc, curr) => {
                const key = curr["Household_Number__c"] + "-" + curr["ffg_id"];

                if (!acc[key]) {
                  acc[key] = [];
                }

                acc[key].push(curr);

                return acc;
              }, {});

            const groupedDataArray = Object.values(groupedData);

            //console.log(groupedDataArray.slice(0, 10));

            const finalFormattedHHData = groupedDataArray
              .map((group) => {
                const primaryMember = group.find(
                  (member) => member["Primary_Household_Member__c"] === "Yes"
                );

                if (primaryMember) {
                  return {
                    ...primaryMember,
                    Number_of_Members__c: group.length,
                  };
                } else {
                  //console.log("HOUSEHOLD PRIME MISSING", group);
                  return {
                    message: `Household: ${group[0].Household_Number__c} FFG: ${group[0].ffg_id} does not have a primary member.`,
                    status: 500,
                  };
                }
              })
              .filter((value) => value !== undefined);

            const finalFormattedHHDataFiltered = finalFormattedHHData.filter(
              (entry) => entry.status !== 500
            );

            // check training group from formattedPartsData by looping through each row
            // if training group does not exist, return error

            // Extract an array of all ffg_id values from finalFormattedHHData
            // Extract unique ffg_id values from finalFormattedHHData
            const ffgIdSet = new Set(
              finalFormattedHHDataFiltered.map((item) => item.ffg_id)
            );

            // Convert the Set to an array
            const uniqueFfgIds = [...ffgIdSet];

            // Check for the existence of unique ffg_id values in the training_groups array
            const training_groups = await sf_conn.query(
              `SELECT Id, TNS_Id__c FROM Training_Group__c WHERE TNS_Id__c IN (${uniqueFfgIds
                .map((id) => `'${id}'`)
                .join(",")})`
            );

            console.log(
              `Found: ${training_groups.records.length} Total groups`
            );

            //console.log("Total Groups", training_groups.records.length);
            //console.log("Total Groups", training_groups.records.slice(0, 1));

            if (training_groups.totalSize === 0) {
              resolve({
                message: `Could not find any FFG`,
                status: 404,
              });

              return;
            }

            // Map Training Groups SF ID to SF ID
            const trainingGroupsMap = new Map(
              training_groups.records.map((record) => [
                record.TNS_Id__c,
                record.Id,
              ])
            );

            // Iterate over finalFormattedHHData and add the corresponding Id
            for (const item of finalFormattedHHDataFiltered) {
              const ffgId = item.ffg_id;
              if (trainingGroupsMap.has(ffgId)) {
                item.training_group__c = trainingGroupsMap.get(ffgId);
              } else {
                return resolve({
                  message: `Training Group with ffg_id ${ffgId} does not exist`,
                  status: 404,
                });
              }
            }

            // Query records to update
            const existingHouseholdNumbers = finalFormattedHHDataFiltered
              .map((record) => record.Household__c)
              .filter((record) => record !== "");

            // const householdsFromSF = await sf_conn.query(
            //   `SELECT Id, Name, Household_Number__c FROM Household__c WHERE Id IN ('${existingHouseholdNumbers.join(
            //     "','"
            //   )}')`
            // );

            const batchSize = 500; // You can adjust the batch size based on your requirements
            const batchedHouseholdNumbers = [];
            for (
              let i = 0;
              i < existingHouseholdNumbers.length;
              i += batchSize
            ) {
              const batch = existingHouseholdNumbers.slice(i, i + batchSize);
              batchedHouseholdNumbers.push(batch);
            }

            const householdQueries = batchedHouseholdNumbers.map((batch) => {
              return sf_conn.query(
                `SELECT Id, Farm_Size__c, Household_Number__c, Name, Number_of_Members__c, training_group__c FROM Household__c WHERE Id IN ('${batch.join(
                  "','"
                )}')`
              );
            });

            const householdsFromSFArray = [];
            await Promise.all(
              householdQueries.map(async (queryResult) => {
                const result = await queryResult;
                householdsFromSFArray.push(...result.records);
              })
            );

            console.log(`Returned ${householdsFromSFArray.length} Households`);
            console.log(householdsFromSFArray.slice(0, 2));

            // console.log(existingHouseholdNumbers);

            const HHdataToInsert = finalFormattedHHDataFiltered.map((item) => {
              const {
                Primary_Household_Member__c,
                Household__c,
                ffg_id,
                ...rest
              } = item;
              rest.Id = Household__c;

              return rest;
            });

            const filteredHHDataToInsert = HHdataToInsert.filter(
              (itemToInsert) => {
                return true;
                const matchingHousehold = householdsFromSFArray.find(
                  (sfHousehold) => sfHousehold.Id === itemToInsert.Id
                );
                if (!matchingHousehold) {
                  return true;
                } else if (!areValuesEqual(matchingHousehold, itemToInsert)) {
                  return true;
                } else {
                  return false;
                }
              }
            );

            function areValuesEqual(sfHousehold, itemToInsert) {
              // Compare the values of the fields
              return (
                // sfHousehold.Farm_Size__c === itemToInsert.Farm_Size__c &&
                // sfHousehold.Household_Number__c ===
                //   itemToInsert.Household_Number__c &&
                sfHousehold.Name === itemToInsert.Name
                // sfHousehold.Number_of_Members__c ===
                //   itemToInsert.Number_of_Members__c &&
                // sfHousehold.training_group__c === itemToInsert.training_group__c
                // Add other fields as needed
              );
            }

            //console.log(HHdataToInsert);

            // const HHResult = await sf_conn.query(
            //   query,
            //   async function (queryErr, result) {
            //     if (queryErr) {
            //       return {
            //         status: 500,
            //       };
            //     }

            const HHResult = async () => {
              const batchSize = 200;
              const recordsToUpdateInSalesforce = [];
              const newRecordsToInsertInSalesforce = [];

              filteredHHDataToInsert.forEach((record) => {
                if (record.Id) {
                  recordsToUpdateInSalesforce.push(record);
                } else {
                  newRecordsToInsertInSalesforce.push(record);
                }
              });

              console.log(
                "recordsToUpdateInSalesforce",
                recordsToUpdateInSalesforce.length
              );
              console.log(
                "newRecordsToInsertInSalesforce",
                newRecordsToInsertInSalesforce.length
              );

              const updateBatches = chunkArray(
                recordsToUpdateInSalesforce,
                batchSize
              );
              const insertBatches = chunkArray(
                newRecordsToInsertInSalesforce,
                batchSize
              );

              const executeBatchOperation = async (action, batches) => {
                const promises = batches.map(async (batch) => {
                  try {
                    const result = await sf_conn
                      .sobject("Household__c")
                      [action](batch);
                    // Check for custom error structure in the result
                    if (
                      Array.isArray(result) &&
                      result.some((r) => r.success === false && r.errors)
                    ) {
                      //console.error(`Error ${action}ing records:`);
                      //console.log(result.forEach(result => console.log(result.errors)))
                      //console.log(batch)
                      return { status: 500, error: result, batch };
                    } else {
                      return { status: 200, data: result, batch };
                    }
                  } catch (err) {
                    //console.error(`Error ${action}ing records:`, err);
                    return { status: 500, error: err, batch };
                  }
                });

                return Promise.all(promises);
              };

              const updateResults = await executeBatchOperation(
                "update",
                updateBatches
              );
              const insertResults = await executeBatchOperation(
                "create",
                insertBatches
              );

              //console.log([...updateResults, ...insertResults].)

              //return resolve({data: [], status: 400});
              const failedResults = [...updateResults, ...insertResults].filter(
                (result) => result.status === 500
              );

              // console.log(failedResults);

              return failedResults.length === 0
                ? {
                    status: 200,
                    message: "All batches were successful!",
                    data: [...updateResults, ...insertResults],
                  }
                : {
                    status: 500,
                    message: "System busy please try again.",
                  };
            };

            const chunkArray = (arr, size) => {
              const result = [];
              for (let i = 0; i < arr.length; i += size) {
                result.push(arr.slice(i, i + size));
              }
              return result;
            };

            const hhResult = await HHResult();

            if (hhResult.status !== 200) {
              return resolve(hhResult);
            }

            return;
          });
          stream.on("error", (error) => {
            reject({
              message: "Failed to upload new participants 3",
              status: 500,
            });
          });
        });

        try {
          const streamResult = await streamEndPromise;

          if (streamResult.status === 200) {
            return {
              message: streamResult.message,
              status: streamResult.status,
            };
          }

          console.log(streamResult);

          return {
            message: streamResult.message
              ? streamResult.message
              : "Failed to upload new participants 1",
            status: streamResult.status ? streamResult.status : 500,
          };
        } catch (error) {
          // console.error(error);

          return {
            message: error.message,
            status: error.status,
          };
        }
      } catch (error) {
        console.error(error);

        return {
          message: "Could not upload file to the server.",
          status: 500,
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

// Helper Functions

const updateAttendance = async (fileData, sf_conn) => {
  try {
    // Split file data into rows
    const rows = fileData.toString().split("\n");

    // Format data into arrays
    const formattedData = rows.map((row) => {
      const slicedPart = row.split(",").slice(23);
      const farmerSFId = row.split(",")[12];
      const ffgId = row.split(",")[17];
      return [farmerSFId, ffgId, ...slicedPart];
    });

    // Clean and parse the formatted data
    const cleanedArray = formattedData
      .filter(Boolean)
      .map((subarray) =>
        subarray.map((item) =>
          item !== undefined ? item.replace(/[\r\n]/g, "").trim() : ""
        )
      );

    // Extract headers from cleaned data
    const headers = cleanedArray[0].map((header, index) => {
      if (index === 0 || index === 1) {
        return header;
      } else {
        const parts = header.split("-");
        return parts[parts.length - 1].trim();
      }
    });

    // Organize data into columns
    const columns = headers.map((header, index) =>
      cleanedArray.slice(1).map((data) => data[index])
    );

    // Clean special characters from columns
    const cleanedColumns = columns.map((column) =>
      column.map((value) =>
        value ? String(value).replace(/[^\w\s-]/g, "") : ""
      )
    );

    // Remove empty arrays
    const filteredColumns = cleanedColumns.filter(
      (column) => column.length > 0
    );

    // Define Salesforce object name
    const sObject = "Attendance__c";

    // Find indices for important columns
    const farmerIdIndex = headers.indexOf("farmer_sf_id");
    const ffgIdIndex = headers.indexOf("ffg_id");

    // Gather all farmer IDs and module IDs
    const farmerIds = filteredColumns[farmerIdIndex].slice(0);
    const moduleIds = headers.slice(2);

    // Create a map of farmer IDs to FFG IDs
    const farmerToFFGMap = Object.fromEntries(
      filteredColumns[farmerIdIndex].map((farmerId, index) => [
        farmerId,
        filteredColumns[ffgIdIndex][index],
      ])
    );

    // Divide farmer IDs into batches of 700 each
    const farmerIdBatches = [];
    for (let i = 0; i < farmerIds.length; i += 500) {
      const batch = farmerIds.slice(i, i + 500);
      farmerIdBatches.push(batch);
    }

    console.log("Querying existing attendance records");

    // Initialize an array to store query results
    const queryResults = [];

    // Execute the query for each batch of farmer IDs
    for (const farmerIdBatch of farmerIdBatches) {
      let done = false;
      let nextRecordsUrl = null;

      while (!done) {
        // Construct a single query for the current batch of farmer IDs and all module IDs
        let query = `
        SELECT Id, Participant__c, Training_Session__r.Training_Module__c, Status__c
        FROM ${sObject}
        WHERE Participant__c IN ('${farmerIdBatch.join("','")}')
          AND Training_Session__r.Training_Module__c IN ('${moduleIds.join(
            "','"
          )}')
        ORDER BY CreatedDate DESC`;

        // Execute the query or queryMore based on the nextRecordsUrl
        const result = nextRecordsUrl
          ? await sf_conn.queryMore(nextRecordsUrl)
          : await sf_conn.query(query);

        // Push the result to the queryResults array
        queryResults.push(...result.records);

        // If done is true, it means all records have been retrieved
        done = result.done;

        // Update nextRecordsUrl for the next iteration if more records are available
        nextRecordsUrl = result.nextRecordsUrl;
      }
    }

    console.log(`This FFG has ${queryResults.length} total attendance records`);

    // Now queryResults contains all the records from all batches

    // Map attendance records by farmer ID and module ID
    const attendanceMap = {};
    queryResults.forEach((record) => {
      const farmerId = record.Participant__c;
      const moduleId = record.Training_Session__r.Training_Module__c;
      if (!attendanceMap[farmerId]) {
        attendanceMap[farmerId] = {};
      }
      attendanceMap[farmerId][moduleId] = record;
    });

    // Fetch unique FFG IDs
    const uniqueFFGIds = [
      ...new Set(filteredColumns[ffgIdIndex].filter(Boolean)),
    ];

    console.log("Querying existing training groups");

    // Query for training groups
    const training_groups = await sf_conn.query(
      `SELECT Id, TNS_Id__c FROM Training_Group__c WHERE TNS_Id__c IN (${uniqueFFGIds
        .map((id) => `'${id}'`)
        .join(",")})`
    );

    // Create a map of FFG IDs to Salesforce IDs
    const trainingGroupsMap = new Map(
      training_groups.records.map((record) => [record.TNS_Id__c, record.Id])
    );

    // Initialize arrays for records to update and create
    const attendanceToUpdate = [];
    const attendanceToCreate = [];

    // Iterate through attendance values and populate update/create arrays
    for (let i = 2; i < filteredColumns.length; i++) {
      const moduleId = headers[i];
      for (let j = farmerIdIndex + 1; j <= filteredColumns[i].length; j++) {
        const attendanceValue = filteredColumns[i][j - 1];
        const farmerId = filteredColumns[farmerIdIndex][j - 1];
        const ffgId = farmerToFFGMap[farmerId];
        const attendanceRecord = attendanceMap[farmerId]?.[moduleId];

        if (
          !(
            attendanceValue === "" ||
            attendanceValue === "1" ||
            attendanceValue === "0"
          )
        ) {
          throw {
            status: 404,
            message: `Invalid attendance value for farmer with SF ID: ${farmerId}`,
          };
        }

        if (attendanceValue !== "") {
          if (attendanceRecord) {
            console.log(
              `Updating for farmer with id ${farmerId} and attendance value ${attendanceValue} for module ${moduleId}`
            );
            const attendanceValueSF =
              attendanceRecord.Status__c === "Present" ? "1" : "0";
            if (attendanceValue !== attendanceValueSF) {
              attendanceToUpdate.push({
                Id: attendanceRecord.Id,
                Status__c: attendanceValue === "1" ? "Present" : "Absent",
              });
            }
          } else {
            const trainingSession = await sf_conn.query(
              `SELECT Id FROM Training_Session__c
                WHERE Training_Group__c = '${trainingGroupsMap.get(
                  ffgId
                )}'AND Training_Module__c = '${moduleId}' LIMIT 1`
            );
            if (trainingSession.records.length > 0) {
              attendanceToCreate.push({
                Status__c: attendanceValue === "1" ? "Present" : "Absent",
                Participant__c: farmerId,
                Training_Session__c: trainingSession.records[0].Id,
                Submission_ID__c: "manual-upload",
              });
            }
          }
        }
      }
    }

    console.log(`Updating ${attendanceToUpdate.length} records.`);
    console.log(`Creating  ${attendanceToCreate.length} records`);

    // console.log(attendanceToCreate);

    // Batch update and create operations
    const updateBatches = chunkArray(attendanceToUpdate, 200);
    const insertBatches = chunkArray(attendanceToCreate, 200);

    // Execute batch update operations
    const updateResults = await executeBatchOperation(
      sf_conn,
      "update",
      updateBatches,
      "Attendance__c"
    );

    // Execute batch insert operations
    const insertResults = await executeBatchOperation(
      sf_conn,
      "create",
      insertBatches,
      "Attendance__c"
    );

    // Check for any failed results
    const failedResults = [...updateResults, ...insertResults].filter(
      (result) => result.status === 500
    );

    // Return appropriate response based on success or failure
    if (failedResults.length === 0) {
      return {
        status: 200,
        message: "All Attendance batches were successful!",
        data: [...updateResults, ...insertResults],
      };
    } else {
      const errorMessage =
        failedResults[0]?.error?.errors[0]?.message || "Unknown error";
      throw {
        status: 500,
        message: `Error updating Attendance: ${errorMessage}`,
      };
    }
  } catch (error) {
    // Return error message if an error occurred
    return {
      message: error.message,
      status: 500,
    };
  }
};

function validateFileType(ext) {
  return ext === ".csv";
}

async function readFileData(stream) {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.on("data", (chunk) => {
      data += chunk.toString();
    });
    stream.on("end", () => {
      resolve(data);
    });
    stream.on("error", (error) => {
      reject(error);
    });
  });
}

function formatHHData(fileData) {
  const rows = fileData.toString().split("\n").filter(Boolean); // Filter out empty lines
  if (rows.length === 0) {
    throw new Error("No data found in the CSV file.");
  }

  const HEADER_MAPPING = {
    hh_number: "Household_Number__c",
    first_name: "Name",
    middle_name: "Middle_Name__c",
    last_name: "Last_Name__c",
    sf_household_id: "Household__c",
    farmer_number: "Primary_Household_Member__c",
    tns_id: "TNS_Id__c",
    gender: "Gender__c",
    age: "Age__c",
    "Phone Number": "Phone_Number__c",
    coffee_tree_numbers: "Farm_Size__c",
    ffg_id: "ffg_id",
    status: "Status__c",
    farmer_sf_id: "Participant__c",
    number_of_coffee_plots: "Number_of_Coffee_Plots__c",
  };

  const REQUIRED_COLUMNS = [
    "Farm_Size__c",
    "ffg_id",
    "Household_Number__c",
    "Primary_Household_Member__c",
    "Household__c",
    "Status__c",
    "Number_of_Coffee_Plots__c",
  ];

  const header = rows[0]
    .split(",")
    .map((value) => HEADER_MAPPING[value] || value);

  const columnIndexMap = REQUIRED_COLUMNS.reduce((map, column) => {
    map[column] = header.indexOf(column);
    return map;
  }, {});

  const formattedData = rows.slice(1).reduce((acc, row) => {
    if (row.trim()) {
      const values = row.split(",");
      const formattedRow = {};

      REQUIRED_COLUMNS.forEach((column) => {
        const index = columnIndexMap[column];
        if (index !== -1) {
          let value = values[index].replace(/"/g, "").trim();

          // Handling specific column transformations
          if (column === "Primary_Household_Member__c") {
            formattedRow[column] =
              value === "1" ? "Yes" : value === "2" ? "No" : value;
          } else if (column === "Farm_Size__c") {
            formattedRow[column] = value === "null" ? null : value;
          } else if (column === "Number_of_Coffee_Plots__c") {
            formattedRow[column] = value === "null" ? null : value;
          } else {
            formattedRow[column] = value;
          }
        }
      });

      if (
        formattedRow["Status__c"] &&
        formattedRow["Status__c"].toLowerCase() === "inactive"
      ) {
        return acc;
      }

      // Format the Household_Number__c correctly
      let householdNumber = values[columnIndexMap["Household_Number__c"]]
        .replace(/"/g, "")
        .trim();

      // Remove any leading zeros first
      householdNumber = householdNumber.replace(/^0+/, "");

      // Prepend '0' only if it's less than 10
      if (parseInt(householdNumber, 10) < 10) {
        formattedRow["Name"] = "0" + householdNumber;
      } else {
        formattedRow["Name"] = householdNumber;
      }

      formattedRow["Household_ID__c"] =
        values[header.indexOf("ffg_id")].replace(/"/g, "") +
        householdNumber;

      formattedRow["Household_Number__c"] = parseInt(householdNumber); // Store cleaned-up number

      acc.push(formattedRow);
    }
    return acc;
  }, []);

  return formattedData;
}

function formatParticipantData(fileData, trainingGroupsMap, recentHHData) {
  const rows = fileData.toString().split("\n");
  if (rows.length === 0) {
    throw new Error("No data found in the CSV file.");
  }

  const HEADER_MAPPING = {
    hh_number: "Household_Number__c",
    first_name: "Name",
    middle_name: "Middle_Name__c",
    last_name: "Last_Name__c",
    sf_household_id: "Household__c",
    farmer_number: "Primary_Household_Member__c",
    tns_id: "TNS_Id__c",
    gender: "Gender__c",
    age: "Age__c",
    phone_number: "Phone_Number__c",
    coffee_tree_numbers: "Farm_Size__c",
    ffg_id: "ffg_id",
    status: "Status__c",
    farmer_sf_id: "Participant__c",
    national_identification_id: "Other_ID_Number__c",
    coop_membership_number: "Other_ID_Number__c",
    number_of_coffee_plots: "Number_of_Coffee_Plots__c",
  };

  // map data and headers for Participant__c
  const participantsHeaders = [
    "Name",
    "Middle_Name__c",
    "Last_Name__c",
    "Gender__c",
    "Age__c",
    "Phone_Number__c",
    "Primary_Household_Member__c",
    "TNS_Id__c",
    "Training_Group__c",
    "Household__c",
    "Status__c",
    "Participant__c",
    "Household_Number__c",
    "Other_ID_Number__c",
    "Number_of_Coffee_Plots__c",
  ];

  const header = rows[0]
    .split(",")
    .map((value) => HEADER_MAPPING[value] || value);

  const columnIndexMap2 = participantsHeaders.reduce((map, column) => {
    map[column] = header.indexOf(column);
    return map;
  }, {});

  const formattedPartsData = rows.slice(1).map((row) => {
    if (row !== "") {
      const values = row.split(",");
      const formattedRow = {};

      for (const column of participantsHeaders) {
        const index = columnIndexMap2[column];
        formattedRow[column] = values[index];

        const value = values[index] ? values[index].replace(/"/g, "") : "";

        formattedRow["Training_Group__c"] = trainingGroupsMap.get(
          values[header.indexOf("ffg_id")].replace(/"/g, "")
        );

        // Change
        if (column === "Primary_Household_Member__c" && value === "1") {
          formattedRow[column] = "Yes";
        } else if (column === "Primary_Household_Member__c" && value === "2") {
          formattedRow[column] = "No";
        } else if (column === "Number_of_Coffee_Plots__c") {
          formattedRow[column] = value === "null" ? null : value;
        } else {
          formattedRow[column] = value != "null" ? value : "";
        }

        let hhNumber = "";
        if (parseInt(values[header.indexOf("Household_Number__c")], 10) < 10) {
          // Prepend '0' to formattedRow["Name"]
          hhNumber =
            "0" +
            values[header.indexOf("Household_Number__c")].replace(/"/g, "");
        } else {
          hhNumber = values[header.indexOf("Household_Number__c")].replace(
            /"/g,
            ""
          );
        }

        formattedRow["TNS_Id__c"] =
          values[header.indexOf("ffg_id")].replace(/"/g, "") +
          hhNumber +
          values[header.indexOf("Primary_Household_Member__c")].replace(
            /"/g,
            ""
          );
        formattedRow["Resend_to_OpenFN__c"] = "TRUE";
        formattedRow["Create_In_CommCare__c"] = "FALSE";
        formattedRow["Check_Status__c"] = "TRUE";
        // formattedRow["Household__c"] = null; // Default value if no match is found
      }

      return formattedRow;
    }
  });

  // Add Household Id for new participants or in case participant Households have changed
  const formattedPartsDataWithHHId = addHHIdToParticipants(
    formattedPartsData,
    recentHHData
  );

  return formattedPartsDataWithHHId;
}

async function groupDataByHousehold(formattedData) {
  const errors = [];
  const groupedData = formattedData
    .filter((item) => item !== undefined)
    .reduce((acc, curr) => {
      const key = curr["Household_Number__c"] + "-" + curr["ffg_id"];
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(curr);
      return acc;
    }, {});

  const households = [];

  Object.values(groupedData).forEach((group) => {
    const primaryMember = group.find(
      (member) => member["Primary_Household_Member__c"] === "Yes"
    );
    const secondaryMember = group.find(
      (member) => member["Primary_Household_Member__c"] === "No"
    );

    if (group.length === 2 && secondaryMember === undefined) {
      errors.push(
        `Household: ${group[0].Household_Number__c} has the same SF ID in both FFG: ${group[0].ffg_id} and FFG: ${group[1].ffg_id} If one is a new Household please leave the SF Id empty.`
      );
      return;
    }

    if (
      group.length === 2 &&
      primaryMember.Household_Number__c !== secondaryMember.Household_Number__c
    ) {
      errors.push(
        `SF Household: ${group[0].Household_Number__c} / FFG ${group[0].ffg_id} has 2 households with different SF Ids.`
      );
      return;
    }

    if (group.length > 2) {
      errors.push(
        `Household: ${group[0].Household_Number__c} FFG ${group[0].ffg_id} has more than 2 members`
      );
      return;
    }

    if (primaryMember) {
      households.push({
        ...primaryMember,
        Number_of_Members__c: group.length,
      });
    } else {
      console.log(group);
      errors.push(
        `Household: ${group[0].Household_Number__c} FFG: ${group[0].ffg_id} does not have a primary member.`
      );
    }
  });

  if (errors.length > 0) {
    const errorFileBase64 = await createErrorExcelFile(errors);
    return {
      status: 500,
      message: "Validation errors found.",
      file: errorFileBase64,
    };
  }

  return households;
}

async function createErrorExcelFile(errors) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Errors");
  worksheet.columns = [{ header: "Error", key: "error", width: 100 }];

  errors.forEach((error) => {
    worksheet.addRow({ error });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer.toString("base64");
}

async function matchFFGsWithSalesforceIds(sf_conn, groupedData) {
  try {
    const ffgIdSet = new Set(groupedData.map((item) => item.ffg_id));
    const uniqueFFGIds = [...ffgIdSet];

    const training_groups = await sf_conn.query(
      `SELECT Id, TNS_Id__c FROM Training_Group__c WHERE TNS_Id__c IN (${uniqueFFGIds
        .map((id) => `'${id}'`)
        .join(",")})`
    );

    console.log(`Found: ${training_groups.records.length} Total groups`);

    if (training_groups.totalSize === 0) {
      throw { message: `Could not find any FFG`, status: 404 };
    }

    const trainingGroupsMap = new Map(
      training_groups.records.map((record) => [record.TNS_Id__c, record.Id])
    );

    return trainingGroupsMap;
  } catch (error) {
    throw error;
  }
}

async function updateHouseholdsInSalesforce(
  sf_conn,
  groupedData,
  trainingGroupsMap
) {
  try {
    const existingHouseholdNumbers = groupedData
      .map((record) => record.Household__c)
      .filter((record) => record !== "");

    const householdBatchSize = 700;
    const batchedHouseholdNumbers = chunkArray(
      existingHouseholdNumbers,
      householdBatchSize
    );

    const householdQueries = batchedHouseholdNumbers.map((batch) => {
      return sf_conn.query(
        `SELECT Id, Farm_Size__c, Number_of_Coffee_Plots__c, Household_ID__c, Household_Number__c, Name, Number_of_Members__c, training_group__c 
        FROM Household__c WHERE Id IN ('${batch.join("','")}')`
      );
    });

    const householdsFromSFArray = await Promise.all(householdQueries).then(
      (results) => results.flatMap((result) => result.records)
    );

    console.log(`Returned ${householdsFromSFArray.length} Households`);
    console.log(householdsFromSFArray.slice(0, 2));

    const HHdataToInsert = groupedData.map((item) => {
      const { Primary_Household_Member__c, Household__c, ffg_id, ...rest } =
        item;
      rest.Id = Household__c;
      rest.Training_Group__c = trainingGroupsMap.get(ffg_id);
      return rest;
    });

    const filteredHHDataToInsert = HHdataToInsert.filter((itemToInsert) => {
      const matchingHousehold = householdsFromSFArray.find(
        (sfHousehold) => sfHousehold.Id === itemToInsert.Id
      );
      if (!matchingHousehold) {
        return true;
      } else if (!didHouseholdValuesChange(matchingHousehold, itemToInsert)) {
        // console.log("Values changed");
        // console.log(matchingHousehold);
        // console.log(itemToInsert);
        return true;
      } else {
        return false;
      }
    });

    // console.log(
    //   `Actual number of household to insert is: ${filteredHHDataToInsert.length}`
    // );
    // console.log(filteredHHDataToInsert.slice(0, 1));

    const hhResult = await executeHHResult(sf_conn, filteredHHDataToInsert);
    return hhResult;
  } catch (error) {
    console.error("Error updating households:", error.message);
    throw {
      status: error.status || 500,
      message: error.message || "Unknown error while updating households",
    };
  }
}

async function queryRecentHHData(sf_conn, hhResult) {
  let recentHHsIds = [];

  hhResult.data.forEach((result) =>
    result.data.forEach((result) => recentHHsIds.push(result.id))
  );

  const recentHousehoulds = [];
  for (let i = 0; i < recentHHsIds.length; i += 700) {
    const batch = recentHHsIds.slice(i, i + 700);
    recentHousehoulds.push(batch);
  }

  const recentHHsQuery = recentHousehoulds.map((batch) => {
    return sf_conn.query(
      `SELECT Id, Household_Number__c, training_group__c FROM Household__c WHERE Id IN ('${batch.join(
        "','"
      )}')`
    );
  });

  const recentHousehouldsArray = [];
  await Promise.all(
    recentHHsQuery.map(async (queryResult) => {
      const result = await queryResult;
      recentHousehouldsArray.push(...result.records);
    })
  );

  return recentHousehouldsArray;
}

async function updateParticipantsInSalesforce(sf_conn, formattedData) {
  try {
    // Query existing participant records from Salesforce
    const existingParticipants = await queryExistingParticipants(
      sf_conn,
      formattedData
    );

    console.log(
      `We already have ${existingParticipants.length} on salesforce. Here is a sample`
    );

    console.log(existingParticipants.slice(0, 1));

    const participantsToInsert = formattedData.filter((itemToInsert) => {
      const matchingParticipant = existingParticipants.find(
        (sfParticipant) => sfParticipant.Id === itemToInsert.Id
      );
      if (!matchingParticipant) {
        return true;
      } else if (
        !didParticipantValuesChange(matchingParticipant, itemToInsert)
      ) {
        console.log("Values changed");
        console.log(matchingParticipant);
        console.log(itemToInsert);
        console.log("Changed? Yes");
        return true;
      } else {
        return false;
      }
    });

    // Execute update operation for the participants
    const partsData = await executePartsResult(sf_conn, participantsToInsert);

    return partsData;
  } catch (error) {
    console.error("Error updating participants:", error.message);
    return {
      status: error.status || 500,
      message: error.message || "Unknown error while updating participants",
    };
  }
}

async function executePartsResult(sf_conn, participantsData) {
  const batchSize = 200;
  const partsToUpdateInSalesforce = [];
  participantsData.forEach((record) => {
    if (record.Id) {
      record.Resend_to_OpenFN__c = true;
      record.Create_In_CommCare__c = false;
      record.Check_Status__c = true;
      partsToUpdateInSalesforce.push(record);
    }
  });

  console.log("partsToUpdateInSalesforce", partsToUpdateInSalesforce.length);

  const updateBatches = chunkArray(partsToUpdateInSalesforce, batchSize);

  const updateResults = await executeBatchOperation(
    sf_conn,
    "update",
    updateBatches,
    "Participant__c"
  );

  const failedResults = [...updateResults].filter(
    (result) => result.status === 500
  );

  if (failedResults.length === 0) {
    return {
      status: 200,
      message: "All batches were successful!",
      data: [...updateResults],
    };
  } else {
    console.log("We got some errors");
    const errorMessage =
      failedResults[0].error.errors[0].message || "Unknown error";
    throw {
      status: 500,
      message: `Error updating Participants: ${errorMessage}`,
    };
  }
}

function addHHIdToParticipants(formattedData, recentHousehouldsArray) {
  // insert Household Id to Household__c field in participantsData
  return formattedData
    .filter((item) => item !== undefined)
    .map((part, index) => {
      const matchingHHRecord = recentHousehouldsArray.find(
        (record) =>
          parseInt(record.Household_Number__c, 10) ===
            parseInt(part.Household_Number__c, 10) &&
          record.Training_Group__c === part.Training_Group__c
      );

      let Household = part.Household__c;
      if (matchingHHRecord) {
        Household = matchingHHRecord.Id;
      }
      // else {
      //   return resolve({
      //     status: 500,
      //     message: `No matching Household record found for Farmer: ${part.TNS_Id__c}`,
      //   });
      // }

      const { Participant__c, Household__c, Household_Number__c, ...rest } =
        part;

      return {
        ...rest,
        Id: Participant__c,
        Household__c: Household,
      };
    });
}

async function queryExistingParticipants(sf_conn, participantsData) {
  const participantIds = participantsData.map((part) => part.Id);
  if (participantIds.length === 0) return [];

  const batchSize = 700;
  const participantRecords = [];
  for (let i = 0; i < participantIds.length; i += batchSize) {
    const batchIds = participantIds.slice(i, i + batchSize);
    const queryResult = await sf_conn.query(
      `SELECT Id, Name, Training_Group__c, TNS_Id__c, Phone_Number__c, 
          Middle_Name__c, Last_Name__c, Gender__c, Age__c, Primary_Household_Member__c, 
          Household__c, Status__c, Other_ID_Number__c, Number_of_Coffee_Plots__c
        FROM Participant__c WHERE Id IN ('${batchIds.join("','")}')`
    );
    participantRecords.push(...queryResult.records);
  }
  return participantRecords;
}

async function writeUploadedFile(stream, ext) {
  // Implement writeUploadedFile function
  // const success = partsData.every(
  //   (result) => result.success === true
  // );
  //if (success) {
  // check if uploads folder exists
  // const uploadsFolder = join(getDirName(import.meta.url), "../../uploads");
  // if (!fs.existsSync(uploadsFolder)) {
  //   fs.mkdirSync(uploadsFolder);
  // }
  // // name file with user_id and date
  // const newFilename = `participants-${Date.now()}${ext}`;
  // stream = createReadStream();
  // let serverFile = join(
  //   getDirName(import.meta.url),
  //   `../../uploads/${newFilename}`
  // );
  // let writeStream = createWriteStream(serverFile);
  // await stream.pipe(writeStream);
}

async function executeHHResult(sf_conn, filteredHHDataToInsert) {
  const batchSize = 200;
  const recordsToUpdateInSalesforce = [];
  const newRecordsToInsertInSalesforce = [];

  filteredHHDataToInsert.forEach((record) => {
    if (record.Id) {
      recordsToUpdateInSalesforce.push(record);
    } else {
      newRecordsToInsertInSalesforce.push(record);
    }
  });

  console.log(
    "recordsToUpdateInSalesforce",
    recordsToUpdateInSalesforce.length
  );
  console.log(
    "newRecordsToInsertInSalesforce",
    newRecordsToInsertInSalesforce.length
  );

  const updateBatches = chunkArray(recordsToUpdateInSalesforce, batchSize);
  const insertBatches = chunkArray(newRecordsToInsertInSalesforce, batchSize);

  const updateResults = await executeBatchOperation(
    sf_conn,
    "update",
    updateBatches,
    "Household__c"
  );
  const insertResults = await executeBatchOperation(
    sf_conn,
    "create",
    insertBatches,
    "Household__c"
  );

  const failedResults = [...updateResults, ...insertResults].filter(
    (result) => result.status === 500
  );

  if (failedResults.length === 0) {
    console.log("All households updated.");
    return {
      status: 200,
      message: "All Household batches were successful!",
      data: [...updateResults, ...insertResults],
    };
  } else {
    const errorMessage =
      failedResults[0].error.errors[0].message || "Unknown error";
    throw {
      status: 500,
      message: `Error updating households: ${errorMessage}`,
    };
  }
}

function didHouseholdValuesChange(sfHousehold, itemToInsert) {
  let farmSize = itemToInsert.Farm_Size__c;
  let numberOfPlots = itemToInsert.Number_of_Coffee_Plots__c;
  if (farmSize !== null) {
    farmSize = parseInt(itemToInsert.Farm_Size__c);
  }

  if (numberOfPlots !== null) {
    numberOfPlots = parseInt(itemToInsert.Number_of_Coffee_Plots__c);
  }

  return (
    sfHousehold.Number_of_Coffee_Plots__c === numberOfPlots &&
    sfHousehold.Farm_Size__c === farmSize &&
    sfHousehold.Name === itemToInsert.Name &&
    sfHousehold.Number_of_Members__c === itemToInsert.Number_of_Members__c &&
    sfHousehold.Training_Group__c === itemToInsert.Training_Group__c &&
    sfHousehold.Household_ID__c === itemToInsert.Household_ID__c
  );
}

function didParticipantValuesChange(sfParticipant, itemToInsert) {
  // Check if Middle_Name__c in sfParticipant is null or undefined
  const sfMiddleNameIsNull =
    sfParticipant.Middle_Name__c === null ||
    sfParticipant.Middle_Name__c === undefined ||
    sfParticipant.Middle_Name__c === "";

  // Check if Middle_Name__c in itemToInsert is an empty string
  const itemMiddleNameIsEmpty = itemToInsert.Middle_Name__c === "";

  // Compare Middle_Name__c values accounting for both scenarios
  const middleNameComparison =
    (sfMiddleNameIsNull && itemMiddleNameIsEmpty) || // Both are null/empty
    sfParticipant.Middle_Name__c === itemToInsert.Middle_Name__c; // Normal comparison

  // Check if Last_Name__c in sfParticipant is null or undefined
  const sfLastNameIsNull =
    sfParticipant.Last_Name__c === null ||
    sfParticipant.Last_Name__c === undefined ||
    sfParticipant.Middle_Name__c === "";

  // Check if Last_Name__c in itemToInsert is an empty string
  const itemLastNameIsEmpty = itemToInsert.Last_Name__c === "";

  // Compare Last_Name__c values accounting for both scenarios
  const lastNameComparison =
    (sfLastNameIsNull && itemLastNameIsEmpty) || // Both are null/empty
    sfParticipant.Last_Name__c === itemToInsert.Last_Name__c; // Normal comparison

  const normalize = (value) => (value === null ? "" : value);

  const sfOtherIdIsNull = normalize(sfParticipant.Other_ID_Number__c);
  const itemOtherIdIsEmpty = normalize(itemToInsert.Other_ID_Number__c);

  let numberOfTrees = itemToInsert.Number_of_Coffee_Plots__c;

  if (numberOfTrees !== null) {
    numberOfTrees = parseInt(itemToInsert.Number_of_Coffee_Plots__c);
  }

  return (
    sfParticipant.Name === itemToInsert.Name &&
    sfParticipant.Training_Group__c === itemToInsert.Training_Group__c &&
    sfParticipant.TNS_Id__c === itemToInsert.TNS_Id__c &&
    sfParticipant.Age__c === parseInt(itemToInsert.Age__c) &&
    sfParticipant.Primary_Household_Member__c ===
      itemToInsert.Primary_Household_Member__c &&
    sfParticipant.Household__c === itemToInsert.Household__c &&
    sfParticipant.Status__c === itemToInsert.Status__c &&
    sfParticipant.Gender__c === itemToInsert.Gender__c &&
    normalize(sfParticipant.Phone_Number__c) ===
      normalize(itemToInsert.Phone_Number__c) &&
    //sfParticipant.Number_of_Coffee_Plots__c === numberOfTrees &&
    middleNameComparison && // Include the modified comparison for Middle_Name__c
    lastNameComparison && // Include the modified comparison for Last_Name__c
    sfOtherIdIsNull === itemOtherIdIsEmpty
  );
}

async function executeBatchOperation(sf_conn, action, batches, object) {
  const results = await Promise.all(
    batches.map(async (batch) => {
      try {
        const result = await sf_conn.sobject(object)[action](batch);
        result.map((data) => {
          if (data.success === false) {
            console.log(data.errors[0]);
            //return { status: 500, error: result[0], batch };
          }
        });
        if (
          Array.isArray(result) &&
          result.some((r) => r.success === false && r.errors.length > 0)
        ) {
          console.error(`Error ${action}ing records:`);
          // console.log(result[0]);
          return { status: 500, error: result[0], batch };
        } else {
          return { status: 200, data: result, batch };
        }
      } catch (err) {
        console.error(`Error ${action}ing records:`, err);
        return { status: 500, error: err[0], batch };
      }
    })
  );

  return results;
}

const chunkArray = (arr, size) => {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
};

export default ParticipantsResolvers;
