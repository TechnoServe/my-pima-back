import Projects from "../models/projects.models.mjs";
import { join, parse } from "path";
import fs, { createWriteStream } from "fs";
import { getDirName } from "../utils/getDirName.mjs";

const ParticipantsResolvers = {
  Query: {
    getParticipantsByProject: async (_, { project_id }, { sf_conn }) => {
      try {
        // check if project exists by project_id
        const project = await Projects.findOne({
          where: { sf_project_id: project_id },
        });

        if (!project) {
          return {
            message: "Project not found",
            status: 404,
          };
        }

        let participants = [];

        // Perform the initial query
        let result = await sf_conn.query(
          "SELECT Id, Name, Middle_Name__c, Last_Name__c, Gender__c, Age__c, Household__c, Household__r.Farm_Size__c, Household__r.Name, Training_Group__r.TNS_Id__c, Training_Group__r.Project_Location__c, TNS_Id__c, Status__c, Trainer_Name__c, Project__c, Training_Group__c, Training_Group__r.Responsible_Staff__r.ReportsToId, Household__c, Primary_Household_Member__c, Create_In_CommCare__c, Other_ID_Number__c FROM Participant__c WHERE Project__c = '" +
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

        if (participants.totalSize === 0) {
          return {
            message: "Participants not found",
            status: 404,
          };
        }

        // Parallelize additional queries using Promise.all
        const [res1, reportsTo] = await Promise.all([
          sf_conn.query(`SELECT Id, Location__r.Name FROM Project_Location__c`),
          sf_conn.query(`SELECT Id, Name FROM Contact`),
        ]);

        return {
          message: "Participants fetched successfully",
          status: 200,
          participants: participants.map(async (participant) => {
            return {
              p_id: participant.Id,
              first_name: participant.Name,
              middle_name: participant.Middle_Name__c
                ? participant.Middle_Name__c
                : "null",
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
              primary_household_member:
                participant.Primary_Household_Member__c == "Yes" ? 1 : 2,
              create_in_commcare: participant.Create_In_CommCare__c,
              coop_membership_number: participant.Other_ID_Number__c,
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
            const fileData = Buffer.concat(chunks);

            const rows = fileData.toString().split("\n");

            const header = rows[0].split(",");

            // replace header values with Salesforce API names
            header.forEach((value, index) => {
              if (value === "hh_number") {
                header[index] = "Household_Number__c";
              } else if (value === "first_name") {
                header[index] = "Name";
              } else if (value === "middle_name") {
                header[index] = "Middle_Name__c";
              } else if (value === "last_name") {
                header[index] = "Last_Name__c";
              } else if (value === "sf_household_id") {
                header[index] = "Household__c";
              } else if (value === "farmer_number") {
                header[index] = "Primary_Household_Member__c";
              } else if (value === "tns_id") {
                header[index] = "TNS_Id__c";
              } else if (value === "gender") {
                header[index] = "Gender__c";
              } else if (value === "age") {
                header[index] = "Age__c";
              } else if (value === "Phone Number") {
                header[index] = "Phone_Number__c";
              } else if (value === "coffee_tree_numbers") {
                header[index] = "Farm_Size__c";
              } else if (value === "ffg_id") {
                header[index] = "ffg_id";
              } else if (value === "status") {
                header[index] = "Status__c";
              } else if (value === "farmer_sf_id") {
                header[index] = "Participant__c";
              }
            });

            console.log("Begin updating the attendane...");

            // const attendance = await updateAttendance(rows, sf_conn);

            // if (attendance.status !== 200) {
            //   return reject({
            //     message: attendance.message,
            //     status: attendance.status,
            //   });
            // }

            // return reject({
            //   message: "END OF PROGRAM",
            //   status: 500,
            // });

            // console.log(attendance);
            console.log("Done updating the attendance...");

            // Get the indexes of the required columns
            const requiredColumns = [
              "Farm_Size__c",
              "ffg_id",
              "Household_Number__c",
              "Primary_Household_Member__c",
              "Household__c",
            ];
            const nameColumnIndex = header.lastIndexOf("Household_Number__c");
            const columnIndexMap = requiredColumns.reduce((map, column) => {
              map[column] = header.indexOf(column);
              // if (column === "Household_Number_Test__c") {
              //   map[column] = header.indexOf("Household_Number__c");
              // }

              return map;
            }, {});

            // Process each row of data
            const formattedData = rows.slice(1).map((row) => {
              if (row !== "") {
                const values = row.split(",");
                const formattedRow = {};

                for (const column of requiredColumns) {
                  const index = columnIndexMap[column];
                  if (
                    column === "Primary_Household_Member__c" &&
                    values[index] === "1"
                  ) {
                    formattedRow[column] = "Yes";
                  } else if (
                    column === "Primary_Household_Member__c" &&
                    values[index] === "2"
                  ) {
                    formattedRow[column] = "No";
                  } else {
                    formattedRow[column] = values[index];
                  }
                }

                formattedRow["Household_Number__c"] = values[nameColumnIndex];
                formattedRow["Name"] = values[nameColumnIndex];

                return formattedRow;
              }
            });

            console.log("Total Uploaded Records: ", formattedData.length);
            // console.log("Sample formatted data", formattedData);

            // group data by Household_Number__c and take the row with Primary_Household_Member__c = 'Yes', and get total number of rows in each group and assign total number to Number_of_Members__c
            const groupedData = formattedData
              .filter((item) => item !== undefined)
              .reduce((acc, curr) => {
                const key = curr["Household_Number__c"];

                if (!acc[key]) {
                  acc[key] = [];
                }

                acc[key].push(curr);

                return acc;
              }, {});

            const groupedDataArray = Object.values(groupedData);

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
                    message: `Household ${group[0].Household_Number__c} does not have a primary member.`,
                    status: 500,
                  };
                }
              })
              .filter((value) => value !== undefined);

            // Assuming you want to handle the error at this point
            const errorGroups = finalFormattedHHData.filter(
              (entry) => entry.status === 500
            );
            if (errorGroups.length > 0) {
              // console.error("Error in some groups:", errorGroups);
              return resolve({
                status: 400,
                message: errorGroups[0].message,
              });
            }

            // check training group from formattedPartsData by looping through each row
            // if training group does not exist, return error

            // Extract an array of all ffg_id values from finalFormattedHHData
            // Extract unique ffg_id values from finalFormattedHHData
            const ffgIdSet = new Set(
              finalFormattedHHData.map((item) => item.ffg_id)
            );

            // Convert the Set to an array
            const uniqueFfgIds = [...ffgIdSet];

            // Check for the existence of unique ffg_id values in the training_groups array
            const training_groups = await sf_conn.query(
              `SELECT Id, TNS_Id__c FROM Training_Group__c WHERE TNS_Id__c IN (${uniqueFfgIds
                .map((id) => `'${id}'`)
                .join(",")})`
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

            // for (const part of finalFormattedHHData) {
            //   const ffg_id = part.ffg_id;

            //   try {
            //     const tg_res = await sf_conn.query(
            //       `SELECT Id, TNS_Id__c FROM Training_Group__c WHERE TNS_Id__c = '${ffg_id}'`
            //     );

            //     if (tg_res.totalSize === 0) {
            //       resolve({
            //         message: `Training Group with ffg_id ${ffg_id} does not exist`,
            //         status: 404,
            //       });

            //       return;
            //     }

            //     part.training_group__c = tg_res.records[0].Id;
            //   } catch (error) {
            //     console.log(error);
            //     reject({
            //       message: "Training Group not found",
            //       status: 500,
            //     });

            //     return;
            //   }
            // }

            const trainingGroupsMap = new Map(
              training_groups.records.map((record) => [
                record.TNS_Id__c,
                record.Id,
              ])
            );

            //console.log(finalFormattedHHData);

            // Iterate over finalFormattedHHData and add the corresponding Id
            for (const item of finalFormattedHHData) {
              const ffgId = item.ffg_id;
              if (trainingGroupsMap.has(ffgId)) {
                item.training_group__c = trainingGroupsMap.get(ffgId);
              } else {
                console.log(item);
                return resolve({
                  message: `Training Group with ffg_id ${ffgId} does not exist`,
                  status: 404,
                });
              }
            }

            // Query records to update
            const existingHouseholdNumbers = finalFormattedHHData.map(
              (record) => record.Household__c
            );
            // const query = `SELECT Id, Name, Household_Number__c FROM Household__c WHERE Id IN ('${existingHouseholdNumbers.join(
            //   "','"
            // )}')`;

            // console.log(existingHouseholdNumbers);

            const HHdataToInsert = finalFormattedHHData.map((item) => {
              const {
                Primary_Household_Member__c,
                Household__c,
                ffg_id,
                ...rest
              } = item;
              rest.Id = Household__c;

              return rest;
            });

            console.log(HHdataToInsert);

            console.log("we are here....");

            // const HHResult = await sf_conn.query(
            //   query,
            //   async function (queryErr, result) {
            //     if (queryErr) {
            //       return {
            //         status: 500,
            //       };
            //     }

            const HHResult = async () => {
              // const existingRecords = result.records;

              const recordsToUpdateInSalesforce = [];
              const newRecordsToInsertInSalesforce = [];

              HHdataToInsert.forEach((record) => {
                // const existingRecord = existingRecords.find(
                //   (existing) =>
                //     existing.Name ===
                //     record.Household_Number__c
                // );

                if (record.Id) {
                  // If the record already exists, update it
                  // record.Id = existingRecord.Id;
                  recordsToUpdateInSalesforce.push(record);
                } else {
                  // If the record does not exist, insert it
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

              const returnedResult1 = await sf_conn
                .sobject("Household__c")
                .update(
                  recordsToUpdateInSalesforce,
                  function (updateErr, updateResult) {
                    if (updateErr) {
                      return { status: 500 };
                    }

                    return {
                      status: 200,
                      data: updateResult,
                    };
                  }
                );

              const returnedResult2 = await sf_conn
                .sobject("Household__c")
                .create(
                  newRecordsToInsertInSalesforce,
                  function (insertErr, insertResult) {
                    if (insertErr) {
                      return { status: 500 };
                    }

                    return {
                      status: 200,
                      data: insertResult,
                    };
                  }
                );

              return [...returnedResult1, ...returnedResult2];
            };
            //);

            const hhResult = await HHResult();

            hhResult.map((result) => console.log(result));

            if (hhResult.length > 0) {
              // query household records by Household_Number__c

              let HHRecords = [];

              // Perform the initial query
              const records = await sf_conn.query(
                `SELECT Id, Household_Number__c FROM Household__c WHERE Id IN ('${hhResult
                  .map((record) => record.id)
                  .join("','")}')`
              );

              HHRecords = HHRecords.concat(records.records);

              // Check if there are more records to retrieve
              while (records.done === false) {
                // Use queryMore to retrieve additional records
                records = await sf_conn.queryMore(records.nextRecordsUrl);
                HHRecords = HHRecords.concat(records.records);
              }

              console.log(HHRecords);

              // map data and headers for Participant__c
              const participantsHeaders = [
                "Name",
                "Middle_Name__c",
                "Last_Name__c",
                "Gender__c",
                "Age__c",
                //"Phone_Number__c",
                "Primary_Household_Member__c",
                "TNS_Id__c",
                "Training_Group__c",
                "Household__c",
                "Status__c",
                "Participant__c",
              ];

              // "Resend_to_OpenFN__c",
              // "Check_Status__c",
              // "Create_In_CommCare__c",

              const columnIndexMap = participantsHeaders.reduce(
                (map, column) => {
                  map[column] = header.indexOf(column);
                  return map;
                },
                {}
              );

              // GET ALL FFGS

              const formattedPartsData = rows.slice(1).map((row) => {
                if (row !== "") {
                  const values = row.split(",");
                  const formattedRow = {};

                  for (const column of participantsHeaders) {
                    const index = columnIndexMap[column];
                    formattedRow[column] = values[index];

                    formattedRow["Training_Group__c"] = trainingGroupsMap.get(
                      values[header.indexOf("ffg_id")]
                    );

                    // Change
                    if (
                      column === "Primary_Household_Member__c" &&
                      values[index] === "1"
                    ) {
                      formattedRow[column] = "Yes";
                    } else if (
                      column === "Primary_Household_Member__c" &&
                      values[index] === "2"
                    ) {
                      formattedRow[column] = "No";
                    } else {
                      formattedRow[column] = values[index];
                    }

                    formattedRow["Resend_to_OpenFN__c"] = "TRUE";
                    formattedRow["Create_In_CommCare__c"] = "FALSE";
                    formattedRow["Check_Status__c"] = "TRUE";
                    formattedRow["Household__c"] = null; // Default value if no match is found

                    const matchingHHRecord = HHRecords.find(
                      (record) =>
                        record.Household_Number__c ===
                        values[header.indexOf("Household_Number__c")].trim()
                    );

                    if (matchingHHRecord) {
                      formattedRow["Household__c"] = matchingHHRecord.Id;
                    } else {
                      console.warn(
                        `No matching Household record found for Household_Number__c: ${
                          values[header.indexOf("Household_Number__c")]
                        }`
                      );
                    }
                  }

                  return formattedRow;
                }
              });

              // insert res.id to Household__c field in participantsData
              const participantsData = formattedPartsData
                .filter((item) => item !== undefined)
                .map((part, index) => {
                  const { Participant__c, ...rest } = part;
                  return {
                    ...rest,
                    Id: Participant__c,
                    Resend_to_OpenFN__c: true,
                    Create_In_CommCare__c: false,
                  };
                });

              // Query existing records by Participant__c
              const existingParticipants = participantsData.map(
                (record) => record.TNS_Id__c
              );

              // const query = `SELECT Id, TNS_Id__c FROM Participant__c WHERE TNS_Id__c IN ('${existingParticipants.join(
              //   "','"
              // )}')`;

              // const partsResult = await sf_conn.query(
              //   query,
              //   async function (queryErr, result) {
              //     if (queryErr) {
              //       return {
              //         status: 500,
              //       };
              //     }

              const partsResult = async () => {
                //const existingRecords = result.records;

                const partsToUpdateInSalesforce = [];
                const newPartsToInsertInSalesforce = [];

                //if (existingRecords.length > 0) {
                participantsData.forEach((record) => {
                  // const existingRecord = existingRecords.find(
                  //   (existing) => existing.TNS_Id__c === record.TNS_Id__c
                  // );

                  if (record.Id) {
                    // If the record already exists, update it
                    //record.Id = existingRecord.Id;
                    record.Resend_to_OpenFN__c = true;
                    partsToUpdateInSalesforce.push(record);
                  } else {
                    // If the record does not exist, insert it
                    newPartsToInsertInSalesforce.push(record);
                  }
                });
                // } else {
                //   newPartsToInsertInSalesforce.push(...participantsData);
                // }

                console.log(
                  "partsToUpdateInSalesforce",
                  partsToUpdateInSalesforce.length
                );
                console.log(
                  "newPartsToInsertInSalesforce",
                  newPartsToInsertInSalesforce.length
                );
                console.log(
                  "newPartsToInsertInSalesforce",
                  newPartsToInsertInSalesforce
                );

                // Update existing records
                const partsReturnedResult1 = await sf_conn
                  .sobject("Participant__c")
                  .update(
                    partsToUpdateInSalesforce,
                    function (updateErr, updateResult) {
                      if (updateErr) {
                        return { status: 500 };
                      }

                      return {
                        status: 200,
                        data: updateResult,
                      };
                    }
                  );

                // const partsReturnedResult2 = await sf_conn
                //   .sobject("Participant__c")
                //   .create(
                //     newPartsToInsertInSalesforce,
                //     function (insertErr, insertResult) {
                //       if (insertErr) {
                //         return console.error(insertErr);
                //       }

                //       return {
                //         status: 200,
                //         data: insertResult,
                //       };
                //     }
                //   );

                return [...partsReturnedResult1];
              };
              //);

              const partsData = await partsResult();

              console.log(partsData[0]);

              // check if every item in partsResult has success:true
              if (partsData.length > 0) {
                const success = partsData.every(
                  (result) => result.success === true
                );

                if (success) {
                  // check if uploads folder exists
                  const uploadsFolder = join(
                    getDirName(import.meta.url),
                    "../../uploads"
                  );

                  if (!fs.existsSync(uploadsFolder)) {
                    fs.mkdirSync(uploadsFolder);
                  }

                  // name file with user_id and date
                  const newFilename = `participants-${Date.now()}${ext}`;
                  stream = createReadStream();

                  let serverFile = join(
                    getDirName(import.meta.url),
                    `../../uploads/${newFilename}`
                  );

                  let writeStream = createWriteStream(serverFile);

                  await stream.pipe(writeStream);

                  resolve({
                    message: "Participants uploaded successfully",
                    status: 200,
                  });

                  return;
                }
              }

              resolve({
                message: "Failed to upload new participants",
                status: 500,
              });

              return;
            }

            resolve({
              message: "Failed to upload new participants",
              status: 500,
            });
          });
          stream.on("error", (error) => {
            reject({
              message: "Failed to upload new participants",
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
        //console.error(error);

        return {
          message: "Failed to upload new participants 3",
          status: 500,
        };
      }
    },

    syncParticipantsWithCOMMCARE: async (_, { project_id }, { sf_conn }) => {
      try {
        console.log("start here");
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

        console.log(participants);

        // Use Promise to handle the update operation
        const updateResult = await new Promise((resolve, reject) => {
          sf_conn
            .sobject("Participant__c")
            .update(participants, (updateErr, updateResult) => {
              if (updateResult) {
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

          if (success) {
            resolve({
              message: "Participants synced successfully",
              status: 200,
            });

            return;
          }
        }

        resolve({
          message: "Failed to syncing participants",
          status: 500,
        });
      } catch (error) {
        console.log(error);
        return {
          message: "Error syncing participants",
          status: 500,
        };
      }
    },
  },
};

// Helper Functions

const updateAttendance = async (rows, sf_conn) => {
  try {
    const formattedData = rows.map((row) => {
      const slicedPart = row.split(",").slice(21);
      const itemAtIndex10 = row.split(",")[10];
      return [itemAtIndex10, ...slicedPart];
    });

    // Clean empty strings and \r, and remove undefined arrays
    const cleanedArray = formattedData
      .filter((subarray) => subarray && subarray.length > 0)
      .map((subarray) =>
        subarray.map((item) =>
          item !== undefined ? item.replace(/[\r\n]/g, "").trim() : ""
        )
      );

    const headers = cleanedArray[0].map((header, index) => {
      if (index === 0) {
        // Keep the header with farmer_sf_id unchanged
        return header;
      } else {
        // Clean other headers by separating the text by '-' and returning the last value
        const parts = header.split("-");
        return parts[parts.length - 1].trim();
      }
    });

    // Create an array of columns
    const columns = headers.map((header, index) =>
      cleanedArray.slice(1).map((data) => data[index])
    );

    // Clean special characters from columns
    const cleanedColumns = columns.map((column) =>
      column.map((value) => {
        if (value !== undefined && value !== null) {
          return String(value).replace(/[^\w\s-]/g, "");
        }
        return "";
      })
    );

    // Remove empty arrays
    const filteredColumns = cleanedColumns.filter(
      (column) => column.length > 0
    );

    const sObject = "Attendance__c";

    const farmerIdIndex = headers.indexOf("farmer_sf_id");

    const attendanceToUpdate = [];

    for (let i = 1; i < filteredColumns.length; i++) {
      for (let j = farmerIdIndex + 1; j < filteredColumns[i].length; j++) {
        const moduleId = headers[i];
        const attendanceValue = filteredColumns[i][j - 1];
        const farmerId = filteredColumns[farmerIdIndex][j - 1];

        if (attendanceValue !== "") {
          const query = `SELECT Id FROM ${sObject} WHERE Participant__c = '${farmerId}' AND Training_Session__r.Training_Module__c = '${moduleId}' LIMIT 1`;

          const result = await sf_conn.query(query);

          if (result.records.length > 0) {
            const recordId = result.records[0].Id;

            // Use push instead of concat to add elements to the existing array
            attendanceToUpdate.push({
              Id: recordId,
              Status__c: attendanceValue === "1" ? "Present" : "Absent",
            });
          } else {
            throw new Error(
              `No matching record found for farmerId: ${farmerId} and moduleId: ${moduleId}`
            );
          }
        }
      }
    }

    // Update the attendance record
    const updateResult = await sf_conn
      .sobject(sObject)
      .update(attendanceToUpdate);

    if (!updateResult.success) {
      console.error(updateResult);
      //throw new Error(updateResult.errors.join(", "));
    } else {
      console.log(
        "Updated records with Ids:",
        attendanceToUpdate.map((record) => record.Id)
      );
    }

    return {
      message: "Successfully updated attendance records",
      status: 200,
    };
  } catch (error) {
    // console.error(error);
    return {
      message: error.message,
      status: 500,
    };
  }
};

export default ParticipantsResolvers;
