import { FarmVisitService } from "../services/farmVisit.service.mjs";
import { ReportGeneratorService } from "../services/excel.service.mjs";
import fetchImage from "../utils/commCareApi.mjs";
import PQueue from "p-queue";

const FarmVisitsResolvers = {
  Query: {
    getFarmVisitsByProject: async (_, { project_id }, { sf_conn }) => {
      try {
        const farmVisits = await FarmVisitService.getFarmVisitsByProject(
          sf_conn,
          project_id
        );

        return {
          message: "Farm Visits fetched successfully",
          status: 200,
          farmVisits: farmVisits,
        };
      } catch (err) {
        console.error(err);
        return {
          message: err.message || "Something went wrong",
          status: err.status || 500,
        };
      }
    },

    generateFarmVisitReport: async (_, { projectId }) => {
      try {
        // Step 1: Fetch the farm visit statistics
        const trainerStats =
          await FarmVisitService.getFarmVisitStatisticsByTrainer(projectId);

        // Step 2: Generate the Excel report as Base64
        const base64Report =
          await ReportGeneratorService.generateFarmVisitExcelReport(
            trainerStats
          );

        // Step 3: Return the Base64 report
        return {
          message: "Farm Visit report generated successfully",
          status: 200,
          file: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64Report}`,
        };
      } catch (err) {
        console.error("Error generating farm visit report:", err);
        return {
          message: "Failed to generate farm visit report",
          status: 500,
        };
      }
    },

    getSampledVisitsStats: async (_, { projectId }) => {
      return await FarmVisitService.getSampledVisitsStats(projectId);
    },

    getBestPracticeReviewStats: async (_, { projectId, practiceName }) => {
      return await FarmVisitService.getBestPracticeReviewStats(
        projectId,
        practiceName
      );
    },

    getPaginatedReviews: async (
      _,
      { projectId, practiceName, page, pageSize }
    ) => {
      return await FarmVisitService.getPaginatedReviews(
        projectId,
        practiceName,
        page,
        pageSize
      );
    },

    getFVQAsByHousehold: async (_, { project_id }, { sf_conn }) => {
      try {
        console.log("we tried");

        let lastId = null;
        const batchSize = 1000; // Adjust the batch size as needed
        const latestVisitsByDate = [];
        const processedHouseholds = new Set(); // Track processed households

        while (true) {
          let filterCondition = "";
          if (lastId) {
            filterCondition = `AND Id < '${lastId}'`;
          }

          const latestVisitsByDateQuery = `
            SELECT Farm_Visit__r.Household_PIMA_ID__c HH_ID,
              MAX(Id) Id,
              MAX(Farm_Visit__r.Date_Visited__c) Date_Visited   
            FROM FV_Best_Practices__c
            WHERE Farm_Visit__r.Farm_Visited__r.Training_Group__r.Project__c = '${project_id}'
            ${filterCondition}
            GROUP BY Farm_Visit__r.Household_PIMA_ID__c
            ORDER BY MAX(Id) DESC, MAX(Farm_Visit__r.Date_Visited__c) DESC
            LIMIT ${batchSize}
          `;

          const latestVisitsByDateResult = await sf_conn.query(
            latestVisitsByDateQuery
          );
          const newRecords = latestVisitsByDateResult.records.filter(
            (record) => !processedHouseholds.has(record.HH_ID)
          );

          latestVisitsByDate.push(...newRecords);

          // Mark households as processed
          newRecords.forEach((record) => processedHouseholds.add(record.HH_ID));

          if (newRecords.length === 0) {
            break; // No more records to fetch
          } else {
            // Update the lastId for the next batch
            lastId = newRecords[newRecords.length - 1].Id;
          }
        }

        if (latestVisitsByDate.length === 0) {
          return {
            message: "Farm Visits not found",
            status: 404,
          };
        }

        console.log(`Got ${latestVisitsByDate.length} Visits by date`);

        const householdIdToLatestVisitDateMap = new Map();
        latestVisitsByDate.forEach((result) => {
          householdIdToLatestVisitDateMap.set(
            result.Id,
            new Date(result.Date_Visited)
          );
        });

        const householdIds = Array.from(householdIdToLatestVisitDateMap.keys());
        const visitDates = Array.from(householdIdToLatestVisitDateMap.values());

        console.log(Array.from(householdIdToLatestVisitDateMap.keys()).length);
        console.log(
          Array.from(householdIdToLatestVisitDateMap.values()).length
        );

        // Function to split array into chunks
        const chunkArray = (array, chunkSize) => {
          const chunks = [];
          for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
          }
          return chunks;
        };

        // Split householdIds and visitDates into smaller chunks
        const combinedChunks = chunkArray(householdIds, 100); // Adjust chunk size as needed

        console.log("Getting Latest Results only......................");

        const latestVisits = [];
        // Fetch latest visits in smaller chunks
        for (const chunk of combinedChunks) {
          const ids = chunk.map((item) => `'${item}'`).join(", ");
          // const dates = chunk
          //   .map((item) => `${item.date.toISOString().split("T")[0]}`)
          //   .join(", ");
          const latestVisitsQuery = `
        SELECT Id
        FROM FV_Best_Practices__c
        WHERE Id IN (${ids})
      `;

          const latestVisitsResult = await sf_conn.query(latestVisitsQuery);
          latestVisits.push(...latestVisitsResult.records);
        }

        if (latestVisits.length === 0) {
          return {
            message: "Farm Visits not found",
            status: 404,
          };
        }

        console.log(`Got ${latestVisits.length} Latest Visits.`);

        console.log("Getting Latest ALL Farm Visits......................");

        const latestBpIds = latestVisits.map((visit) => `'${visit.Id}'`);
        const farmVisits = [];

        // Split latestBpIds into smaller chunks for farmVisits queries
        const bpIdChunks = chunkArray(latestBpIds, 200); // Adjust chunk size as needed

        // Fetch farm visits in smaller chunks
        for (const chunk of bpIdChunks) {
          const bpIds = chunk.join(", ");
          const farmVisitsQuery = `
              SELECT 
                MAX(Id),
                MAX(Farm_Visit__c) Farm_Visit__c,
                MAX(Farm_Visit__r.Farm_Visit_Type__c) VisitType,
                Farm_Visit__r.Household_PIMA_ID__c,
                MAX(Farm_Visit__r.Farm_Visited__r.Gender__c) gender,
                MAX(Farm_Visit__r.Field_Age__c) fieldAge,
                MAX(Farm_Visit__r.no_of_curedas__c) curedas,
                MAX(Farm_Visit__r.no_of_separate_coffee_fields__c) separateFields,
                MAX(Farm_Visit__r.Date_Visited__c) Date_Visited__c,
                MAX(Farm_Visit__r.Farm_Visited__r.TNS_Id__c) Farmer_TNS_Id__c,
                MAX(Farm_Visit__r.Training_Group__r.TNS_Id__c) TNS_Id__c,
                MAX(Farm_Visit__r.Training_Group__r.Name) ffg_name,
                MAX(how_many_weeds_under_canopy_and_how_big__c) WeedsCanopy,
                MAX(level_of_shade_present_on_the_farm__c) Shade,
                MAX(Do_you_have_compost_manure__c) Compost,
                MAX(number_of_main_stems_on_majority_trees__c) MainStems,
                MAX(do_you_have_a_record_book__c) RecordBook,
                MAX(are_there_records_on_the_record_book__c) RecordOnBook, 
                MAX(Have_herbicides_been_used_on_the_field__c) isHerbicidesUsed,
                MAX(Color_of_coffee_tree_leaves__c) LeavesColor, 
                MAX(planted_intercrop_bananas__c) bananaIntercrop,
                MAX(health_of_new_planting_choice__c) healthOfNewPlanting,
                MAX(has_coffee_field_been_dug__c) fieldDug,
                MAX(stumping_method_on_majority_of_trees__c) stumpingYesNo,
                MAX(number_of_trees_stumped__c) treesStumped,
                MAX(year_stumping__c) yearOfStumping,
                MAX(main_stems_in_majority_coffee_trees__c) MainStemsEt,
                MAX(used_pesticide__c) usedPesticide,
                MAX(pesticide_number_of_times__c) pesticidenumberOfTimes,
                MAX(pesticide_spray_type__c) pesticideSprayType
              FROM FV_Best_Practices__c
              WHERE Id IN (${bpIds})
              GROUP BY Farm_Visit__r.Household_PIMA_ID__c
            `;

          const farmVisitsResult = await sf_conn.query(farmVisitsQuery);
          farmVisits.push(...farmVisitsResult.records);
        }

        if (farmVisits.length === 0) {
          return {
            message: "Farm Visits not found",
            status: 404,
          };
        }

        console.log(`Got ${farmVisits.length} Farm Visits Latest`);

        //console.log(farmVisits);

        const processFarmVisits = async (farmVisits) => {
          const queue = new PQueue({ concurrency: 20 }); // Adjust the concurrency as needed
          let processedCount = 0;

          const chemicalAndFertilizersPromises = farmVisits.map((bp) =>
            queue.add(() =>
              getFVMethods(
                "Chemicals and Fertilizers Applied",
                bp.expr0,
                sf_conn
              )
            )
          );
          const erosionMethodsPromises = farmVisits.map((bp) =>
            queue.add(() => getFVMethods("Erosion Control", bp.expr0, sf_conn))
          );
          const ipdmMethodsPromises = farmVisits.map((bp) =>
            queue.add(() =>
              getFVMethods(
                "Management of Coffee Berry Borer (CBB)",
                bp.expr0,
                sf_conn
              )
            )
          );
          const pruningMethodsPromises = farmVisits.map((bp) =>
            queue.add(() => getFVMethods("Pruning", bp.expr0, sf_conn))
          );

          console.log("Getting all bp results.......");

          const [
            chemicalAndFertilizersResults,
            erosionMethodsResults,
            ipdmMethodsResults,
            pruningMethodsResults,
          ] = await Promise.all([
            Promise.all(chemicalAndFertilizersPromises),
            Promise.all(erosionMethodsPromises),
            Promise.all(ipdmMethodsPromises),
            Promise.all(pruningMethodsPromises),
          ]);

          console.log("We have all bp results.......");

          const processedFarmVisits = farmVisits.map((bp, index) => {
            const visitType = bp.VisitType;

            const chemicalAndFertilizers = chemicalAndFertilizersResults[index];
            const erosionMethods = erosionMethodsResults[index];
            const ipdmMethods = ipdmMethodsResults[index];
            const pruningMethods = pruningMethodsResults[index];

            const chemAndFertilizersArray = chemicalAndFertilizers.split(",");
            const erosionMethodsArray = erosionMethods.split(",");
            const ipdmMethodsArray = ipdmMethods.split(",");
            const pruningMethodsArray = pruningMethods.split(",");

            const compostPass = bp.Compost === "Yes" ? "Yes" : "No";
            const recordBookPass =
              bp.RecordBook === "Yes" && bp.RecordOnBook === "Yes"
                ? "Yes"
                : "No";
            const levelOfShadePass = [
              "Medium shade, 20 to 40%",
              "Heavy shade, over 40%",
            ].includes(bp.Shade)
              ? "Yes"
              : "No";

            let WeedingPass = "No";
            if (
              visitType === "Farm Visit Full - KE" ||
              visitType === "Farm Visit Full - PR"
            ) {
              if (
                bp.WeedsCanopy !==
                  "Many large weeds under the tree canopy (ground is covered with weeds)" &&
                bp.hasHerbicideApplied !== "Yes"
              ) {
                WeedingPass = "Yes";
              }
            } else if (visitType === "Farm Visit Full - ET") {
              if (
                bp.WeedsCanopy !==
                  "Many large weeds under the tree canopy (ground is covered with weeds)" &&
                bp.fieldDug !== "Yes"
              ) {
                WeedingPass = "Yes";
              }
            }

            const NonRecommendedNutri = [
              "Ammonium Nitrate",
              "Did NOT apply any fertilizer in past 12 months",
              "Did not apply any fertilizer in past 12 months",
            ];

            const recommendedMethods = chemAndFertilizersArray.filter(
              (method) => !NonRecommendedNutri.includes(method)
            );

            const nutritionPassCount = recommendedMethods.length;

            let nutritionPass = "No";

            const isLeavesColorDarkGreen =
              bp.LeavesColor ===
              "Nearly all leaves are dark green and less than 5% (less than 5 in 100) are yellow, pale green, or brown.";

            if (
              (visitType === "Farm Visit Full - PR" ||
                visitType === "Farm Visit Full - KE") &&
              nutritionPassCount >= 2 &&
              isLeavesColorDarkGreen
            ) {
              nutritionPass = "Yes";
            } else if (
              visitType === "Farm Visit Full - ET" &&
              nutritionPassCount >= 1 &&
              isLeavesColorDarkGreen
            ) {
              nutritionPass = "Yes";
            }

            const MainStemsPass =
              visitType === "Farm Visit Full - KE" &&
              bp.MainStems >= 1 &&
              bp.MainStems <= 4
                ? "Yes"
                : "No";
            const StumpingPass =
              visitType === "Farm Visit Full - ET" && bp.stumpingYesNo === "Yes"
                ? "Yes"
                : "No";
            const PesticideUsePass =
              visitType === "Farm Visit Full - KE" && bp.usedPesticide === "Yes"
                ? "Yes"
                : "No";
            const filteredErosionMethodsArray = erosionMethodsArray.filter(
              (method) => method !== "No erosion control method seen"
            );

            const ErosionControlPass =
              filteredErosionMethodsArray.length >= 1 ? "Yes" : "No";

            const filteredIpdmMethodsArray = ipdmMethodsArray.filter(
              (method) => method !== "Does not know any methods"
            );

            const IPDMPass =
              filteredIpdmMethodsArray.length >= 3 ? "Yes" : "No";

            let PruningPass = "No";
            if (
              visitType === "Farm Visit Full - KE" ||
              visitType === "Farm Visit Full - PR"
            ) {
              const passCount = pruningMethodsArray.filter(
                (method) =>
                  method !== "N/A" && method !== "No pruning methods used"
              ).length;
              const naCount = pruningMethodsArray.filter(
                (method) => method === "N/A"
              ).length;
              const failCount = pruningMethodsArray.filter(
                (method) => method === "No pruning methods used"
              ).length;

              if (passCount >= 4) {
                PruningPass = "Yes";
              } else if (
                (passCount > 0 && passCount < 4) ||
                naCount > 0 ||
                failCount > 0
              ) {
                PruningPass = "No";
              }
            }

            processedCount++;
            console.log(
              `Processed ${processedCount} out of ${farmVisits.length}`
            );

            return {
              FV_SF_ID: bp.Farm_Visit__c,
              gender: bp.gender,
              fieldAge: bp.fieldAge,
              curedas: bp.curedas,
              separateFields: bp.separateFields,
              ffg_tns_id: bp.TNS_Id__c,
              ffg_name: bp.ffg_name,
              farmer_tns_id: bp.Farmer_TNS_Id__c,
              household_id: bp.Household_PIMA_ID__c,
              date_visited: bp.Date_Visited__c,
              Location_GPS__c: "",
              compost: bp.Compost,
              Compost_Pass: compostPass,
              hasRecordBook: bp.RecordBook,
              recordOnBook: bp.RecordOnBook,
              RecordBook_Pass: recordBookPass,
              levelOfShade: bp.Shade,
              Shade_Pass: levelOfShadePass,
              hasCoffeeFieldBeenDug: bp.fieldDug,
              how_many_weeds_under_canopy_and_how_big__c: bp.WeedsCanopy,
              Weeding_Pass: WeedingPass,
              color_of_coffee_tree_leaves__c: bp.LeavesColor,
              Nutrition_Pass: nutritionPass,
              number_of_main_stems_on_majority_trees__c: bp.MainStems,
              Rejuvenation_Pass: MainStemsPass,
              Have_herbicides_been_used_on_the_field__c: bp.isHerbicidesUsed,
              planted_intercrop_bananas__c: bp.bananaIntercrop,
              BananaIntercrop_Pass: "",
              health_of_new_planting_choice__c: bp.healthOfNewPlanting,
              stumping_method_on_majority_of_trees__c: bp.stumpingYesNo,
              number_of_trees_stumped__c: bp.treesStumped,
              Stumping_Pass: StumpingPass,
              usedPesticide: bp.usedPesticide,
              PesticideUse_Pass: PesticideUsePass,
              pesticidenumberOfTimes: bp.pesticidenumberOfTimes,
              pesticideSprayType: bp.pesticideSprayType,
              MainStemsEthiopia: bp.MainStemsEt,
              yearOfStumping: bp.yearOfStumping,
              erosionMethods: erosionMethods,
              ErosionControl_Pass: ErosionControlPass,
              ipdmMethods: ipdmMethods,
              IPDM_Pass: IPDMPass,
              nutritionMethods: chemicalAndFertilizers,
              pruningMethods: pruningMethods,
              Pruning_Pass: PruningPass,
            };
          });

          return processedFarmVisits;
        };

        const processedFarmVisits = await processFarmVisits(farmVisits);

        return processedFarmVisits;
      } catch (err) {
        console.log(err);
        return {
          message: "Something went wrong",
          status: err.status,
        };
      }
    },

    getFarmVisitsByGroup: async (_, { tg_id }, { sf_conn }) => {
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

        const farmVisits = await sf_conn.query(
          "SELECT Id, Name, Training_Group__r.Name, Training_Group__r.TNS_Id__c, Training_Session__r.Name, Farm_Visited__r.Name, Household_PIMA_ID__c, Farmer_Trainer__r.Name, Visit_Has_Training__c, Date_Visited__c FROM Farm_Visit__c WHERE Training_Group__c = '" +
            tg_id +
            "'"
        );

        if (farmVisits.totalSize === 0) {
          return {
            message: "Farm Visit not found",
            status: 404,
          };
        }

        return {
          message: "Farm Visits fetched successfully",
          status: 200,
          farmVisits: farmVisits.records.map(async (fv) => {
            return {
              fv_id: fv.Id,
              fv_name: fv.Name,
              training_group: fv.Training_Group__r.Name,
              training_session: fv.Training_Session__r
                ? fv.Training_Session__r.Name
                : "N/A",
              tns_id: fv.Training_Group__r.TNS_Id__c || "N/A",
              farm_visited: fv.Farm_Visited__r
                ? fv.Farm_Visited__r.Name
                : "N/A",
              household_id: fv.Household_PIMA_ID__c || "N/A",
              farmer_trainer: fv.Farmer_Trainer__r.Name || "N/A",
              has_training: fv.Visit_Has_Training__c || "No",
              date_visited: fv.Date_Visited__c,
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

    // getFarmVisitsBySession: async (_, { ts_id }, { sf_conn }) => {
    //   try {
    //     // check if training group exists by tg_id
    //     const training_session = await sf_conn.query(
    //       `SELECT Id FROM Training_Session__c WHERE Id = '${ts_id}'`
    //     );

    //     if (training_session.totalSize === 0) {
    //       return {
    //         message: "Training Session not found",
    //         status: 404,
    //       };
    //     }

    //     const farmVisits = await sf_conn.query(
    //       "SELECT Id, Name, Training_Group__r.Name, Training_Group__r.TNS_Id__c, Training_Session__r.Name, Farm_Visited__r.Name, Household_PIMA_ID__c, Farmer_Trainer__r.Name, Visit_Has_Training__c, Date_Visited__c FROM Farm_Visit__c WHERE Training_Session__c = '" +
    //         ts_id +
    //         "'"
    //     );

    //     if (farmVisits.totalSize === 0) {
    //       return {
    //         message: "Farm Visit not found",
    //         status: 404,
    //       };
    //     }

    //     return {
    //       message: "Farm Visits fetched successfully",
    //       status: 200,
    //       farmVisits: farmVisits.records.map(async (fv) => {
    //         return {
    //           fv_id: fv.Id,
    //           fv_name: fv.Name,
    //           training_group: fv.Training_Group__r.Name,
    //           training_session: fv.Training_Session__r
    //             ? fv.Training_Session__r.Name
    //             : "N/A",
    //           tns_id: fv.Training_Group__r.TNS_Id__c || "N/A",
    //           farm_visited: fv.Farm_Visited__r
    //             ? fv.Farm_Visited__r.Name
    //             : "N/A",
    //           household_id: fv.Household_PIMA_ID__c || "N/A",
    //           farmer_trainer: fv.Farmer_Trainer__r.Name || "N/A",
    //           has_training: fv.Visit_Has_Training__c || "No",
    //           date_visited: fv.Date_Visited__c,
    //         };
    //       }),
    //     };
    //   } catch (error) {
    //     console.log(error);

    //     return {
    //       message: error.message,
    //       status: error.status,
    //     };
    //   }
    // },

    // getFarmVisitsByParticipant: async (_, { part_id }, { sf_conn }) => {
    //   try {
    //     // check if training group exists by tg_id
    //     const participant = await sf_conn.query(
    //       `SELECT Id FROM Participant__c WHERE Id = '${part_id}'`
    //     );

    //     if (participant.totalSize === 0) {
    //       return {
    //         message: "Participant not found",
    //         status: 404,
    //       };
    //     }

    //     const farmVisits = await sf_conn.query(
    //       "SELECT Id, Name, Training_Group__r.Name, Training_Group__r.TNS_Id__c, Training_Session__r.Name, Farm_Visited__r.Name, Household_PIMA_ID__c, Farmer_Trainer__r.Name, Visit_Has_Training__c, Farm_Visited__c, Date_Visited__c FROM Farm_Visit__c WHERE Farm_Visited__c = '" +
    //         part_id +
    //         "'"
    //     );

    //     if (farmVisits.totalSize === 0) {
    //       return {
    //         message: "Farm Visit not found",
    //         status: 404,
    //       };
    //     }

    //     return {
    //       message: "Farm Visits fetched successfully",
    //       status: 200,
    //       farmVisits: farmVisits.records.map(async (fv) => {
    //         return {
    //           fv_id: fv.Id,
    //           fv_name: fv.Name,
    //           training_group: fv.Training_Group__r.Name,
    //           training_session: fv.Training_Session__r
    //             ? fv.Training_Session__r.Name
    //             : "N/A",
    //           tns_id: fv.Training_Group__r.TNS_Id__c || "N/A",
    //           farm_visited: fv.Farm_Visited__r
    //             ? fv.Farm_Visited__r.Name
    //             : "N/A",
    //           household_id: fv.Household_PIMA_ID__c || "N/A",
    //           farmer_trainer: fv.Farmer_Trainer__r.Name || "N/A",
    //           has_training: fv.Visit_Has_Training__c || "No",
    //           date_visited: fv.Date_Visited__c,
    //         };
    //       }),
    //     };
    //   } catch (error) {
    //     console.log(error);

    //     return {
    //       message: error.message,
    //       status: error.status,
    //     };
    //   }
    // },
  },
  Mutation: {
    async submitBatch(_, { input }) {
      try {
        const result = await FarmVisitService.submitBatch(input);
        return {
          success: result.success,
          message: result.message,
        };
      } catch (error) {
        console.error(error);
        return {
          success: false,
          message: "Failed to submit batch.",
        };
      }
    },
  },
};

const getFVMethods = async (fvMethod, bpId, sf_conn) => {
  try {
    // check if training group exists by tg_id
    const bpResults = await sf_conn.query(
      `SELECT Id, Best_Practice_Result_Description__c FROM FV_Best_Practice_Results__c 
      WHERE FV_Best_Practices__c = '${bpId}' AND Best_Practice_Result_Type__c = '${fvMethod}'`
    );

    // Loop through bpResults and create an HTML-formatted string
    const htmlFormattedText = bpResults.records
      .map((bpResult) => {
        return `${bpResult.Best_Practice_Result_Description__c}`;
      })
      .join(", ");

    // Wrap the HTML-formatted text with <ul> (unordered list) tags
    return `${htmlFormattedText}`;
  } catch (error) {
    console.log(error);

    return {
      message: error.message,
      status: error.status,
    };
  }
};

const fetchImageWithRetry = async (imageUrl, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const image = await fetchImage(imageUrl);
      return image;
    } catch (error) {
      if (attempt === retries) throw error;
      console.warn(`Retrying fetchImage (${attempt}/${retries})...`);
    }
  }
};

const getTrainingGroupIds = async (sf_conn, project_id) => {
  const groupsQuery = await sf_conn.query(
    `SELECT Id FROM Training_Group__c WHERE Project__c = '${project_id}' LIMIT 100`
  );

  if (groupsQuery.totalSize === 0) {
    throw new Error("Training Groups not found");
  }

  return groupsQuery.records.map((group) => group.Id);
};

// const getFieldsByPracticeName = (practice_name) => {
//   switch (practice_name) {
//     case "Compost":
//       return [
//         {
//           field: "Do_you_have_compost_manure__c",
//           question: "Do you have compost manure?",
//           picture: "photo_of_the_compost_manure__c",
//           isVerified: "Compost_Manure_Photo_Status__c",
//         },
//       ];
//     case "Record Book":
//       return [
//         {
//           field: "are_there_records_on_the_record_book__c",
//           question: "Are there records on the record book?",
//           picture: "take_a_photo_of_the_record_book__c",
//           isVerified: "Record_Book_Photo_Status__c",
//         },
//       ];
//     // Add more cases as needed
//     default:
//       throw new Error("Invalid practice name");
//   }
// };

// const processFarmVisit = async (bp, fields, practice_name) => {
//   const visit = {
//     "Farmer PIMA ID": bp.Farm_Visit__r.Household_PIMA_ID__c,
//     "Farmer TNS ID": bp.Farm_Visit__r.Farm_Visited__r.TNS_Id__c,
//     "Date Visited": bp.Farm_Visit__r.Date_Visited__c,
//     "Farmer Name": bp.Farm_Visit__r.Farm_Visited__r.Name,
//     "Farmer Trainer": bp.Farm_Visit__r.Farmer_Trainer__r.Name,
//     "Correct Answer": "",
//   };

//   for (const field of fields) {
//     visit[`${practice_name}: ${field.question}`] = bp[field.field];
//     visit[
//       `${practice_name}: Review: Correct Answer? (not_approved/approved/invalid)`
//     ] = bp[field.isVerified];
//     visit[`${practice_name}: ${field.picture}`] = await fetchImageWithRetry(
//       bp[field.picture]
//     );
//   }

//   return visit;
// };

export default FarmVisitsResolvers;
