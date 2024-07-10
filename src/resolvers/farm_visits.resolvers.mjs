import Projects from "../models/projects.models.mjs";
import fetchImage from "../utils/commCareApi.mjs";
import ExcelJS from "exceljs";
import PQueue from "p-queue";

const FarmVisitsResolvers = {
  Query: {
    getFarmVisitsByProject: async (_, { project_id }, { sf_conn }) => {
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

        const groups = await sf_conn.query(
          "SELECT Id FROM Training_Group__c WHERE Project__c = '" +
            project_id +
            "'"
        );

        if (groups.totalSize === 0) {
          return {
            message: "Training Groups not found",
            status: 404,
          };
        }

        const tg_ids = groups.records.map((group) => group.Id);

        let farmVisits = [];

        let result = await sf_conn.query(
          "SELECT Id, Name, Training_Group__r.Name, Training_Group__r.TNS_Id__c, Training_Session__r.Name, Farm_Visited__r.Name, Household_PIMA_ID__c, Farmer_Trainer__r.Name, Visit_Has_Training__c, Date_Visited__c FROM Farm_Visit__c WHERE Training_Group__c IN ('" +
            tg_ids.join("','") +
            "')"
        );

        farmVisits = farmVisits.concat(result.records);

        // Check if there are more records to retrieve
        while (result.done === false) {
          // Use queryMore to retrieve additional records
          result = await sf_conn.queryMore(result.nextRecordsUrl);
          farmVisits = farmVisits.concat(result.records);
        }

        if (farmVisits.length === 0) {
          return {
            message: "Farm Visits not found",
            status: 404,
          };
        }

        return {
          message: "Farm Visits fetched successfully",
          status: 200,
          farmVisits: farmVisits.map(async (fv) => {
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

    getFarmVisitsBySession: async (_, { ts_id }, { sf_conn }) => {
      try {
        // check if training group exists by tg_id
        const training_session = await sf_conn.query(
          `SELECT Id FROM Training_Session__c WHERE Id = '${ts_id}'`
        );

        if (training_session.totalSize === 0) {
          return {
            message: "Training Session not found",
            status: 404,
          };
        }

        const farmVisits = await sf_conn.query(
          "SELECT Id, Name, Training_Group__r.Name, Training_Group__r.TNS_Id__c, Training_Session__r.Name, Farm_Visited__r.Name, Household_PIMA_ID__c, Farmer_Trainer__r.Name, Visit_Has_Training__c, Date_Visited__c FROM Farm_Visit__c WHERE Training_Session__c = '" +
            ts_id +
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

    getFarmVisitsByParticipant: async (_, { part_id }, { sf_conn }) => {
      try {
        // check if training group exists by tg_id
        const participant = await sf_conn.query(
          `SELECT Id FROM Participant__c WHERE Id = '${part_id}'`
        );

        if (participant.totalSize === 0) {
          return {
            message: "Participant not found",
            status: 404,
          };
        }

        const farmVisits = await sf_conn.query(
          "SELECT Id, Name, Training_Group__r.Name, Training_Group__r.TNS_Id__c, Training_Session__r.Name, Farm_Visited__r.Name, Household_PIMA_ID__c, Farmer_Trainer__r.Name, Visit_Has_Training__c, Farm_Visited__c, Date_Visited__c FROM Farm_Visit__c WHERE Farm_Visited__c = '" +
            part_id +
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
            if (visitType === "Farm Visit Full - KE") {
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
            
            const isLeavesColorDarkGreen = bp.LeavesColor === "Nearly all leaves are dark green and less than 5% (less than 5 in 100) are yellow, pale green, or brown.";
            
            if (
              visitType === "Farm Visit Full - KE" &&
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
            const ErosionControlPass =
              erosionMethodsArray.length >= 1 ? "Yes" : "No";
            const IPDMPass = ipdmMethodsArray.length >= 3 ? "Yes" : "No";

            let PruningPass = "No";
            if (visitType === "Farm Visit Full - KE") {
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

    // getFVQAsByProjectForReview: async (_, { project_id }, { sf_conn }) => {
    //   try {
    //     const groups = await sf_conn.query(
    //       `SELECT Id FROM Training_Group__c WHERE Project__c = '${project_id}' LIMIT 1`
    //     );

    //     if (groups.totalSize === 0) {
    //       return {
    //         message: "Training Groups not found",
    //         status: 404,
    //       };
    //     }

    //     console.log(`found ${groups.totalSize} groups`);
    //     console.log(groups.records);

    //     const tg_ids = groups.records.map((group) => group.Id);

    //     let farmVisits = [];

    //     let now = new Date();
    //     let dayOfWeek = now.getDay(); // 0 (Sunday) to 6 (Saturday)
    //     let startOfLastWeek = new Date(
    //       now.setDate(now.getDate() - dayOfWeek - 6)
    //     );
    //     startOfLastWeek.setHours(0, 0, 0, 0); // Start of the day
    //     let endOfLastWeek = new Date(startOfLastWeek);
    //     endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
    //     endOfLastWeek.setHours(23, 59, 59, 999); // End of the day

    //     let startOfLastWeekStr = startOfLastWeek.toISOString().slice(0, 10);
    //     let endOfLastWeekStr = endOfLastWeek.toISOString().slice(0, 10);

    //     const tg_ids_string = tg_ids.map((id) => `'${id}'`).join(", ");
    //     const query = `
    //           SELECT Id, Name, Best_Practice_Adoption__c, Farm_Visit__c,
    //                 Farm_Visit__r.Name, Farm_Visit__r.Training_Group__r.Name,
    //                 Farm_Visit__r.Training_Group__r.TNS_Id__c, Farm_Visit__r.Training_Session__r.Name,
    //                 Farm_Visit__r.Farm_Visited__r.Name, Farm_Visit__r.Household_PIMA_ID__c,
    //                 Farm_Visit__r.Farmer_Trainer__r.Name, Farm_Visit__r.Farmer_Trainer__c,
    //                 Farm_Visit__r.Visit_Has_Training__c, Farm_Visit__r.Date_Visited__c,
    //                 number_of_main_stems_on_majority_trees__c, photo_of_trees_and_average_main_stems__c,
    //                 Main_Stems_Photo_Status__c, health_of_new_planting_choice__c, Color_of_coffee_tree_leaves__c,
    //                 how_many_weeds_under_canopy_and_how_big__c, photo_of_weeds_under_the_canopy__c,
    //                 Weeds_Under_Canopy_Photo_Status__c, take_a_photo_of_erosion_control__c,
    //                 Erosion_Control_Photo_Status__c, level_of_shade_present_on_the_farm__c,
    //                 photo_of_level_of_shade_on_the_plot__c, Level_Of_Shade_Plot_Photo_Status__c,
    //                 planted_intercrop_bananas__c, photograph_intercrop_bananas__c, Intercrop_Bananas_Photo_Status__c,
    //                 do_you_have_a_record_book__c, are_there_records_on_the_record_book__c,
    //                 take_a_photo_of_the_record_book__c, Record_Book_Photo_Status__c,
    //                 Do_you_have_compost_manure__c, photo_of_the_compost_manure__c, Compost_Manure_Photo_Status__c
    //           FROM FV_Best_Practices__c
    //           WHERE Farm_Visit__r.Training_Group__c IN (${tg_ids_string}) LIMIT 3
    //         `;

    //     //  AND Farm_Visit__r.Date_Visited__c >= ${startOfLastWeekStr}
    //     // AND Farm_Visit__r.Date_Visited__c <= ${endOfLastWeekStr}

    //     let result = await sf_conn.query(query);
    //     console.log(result);

    //     farmVisits = farmVisits.concat(result.records);

    //     // Check if there are more records to retrieve
    //     while (result.done === false) {
    //       // Use queryMore to retrieve additional records
    //       result = await sf_conn.queryMore(result.nextRecordsUrl);
    //       farmVisits = farmVisits.concat(result.records);
    //     }

    //     if (farmVisits.length === 0) {
    //       return {
    //         message: "Farm Visits not found",
    //         status: 404,
    //       };
    //     }

    //     console.log(`found ${farmVisits.length} best adoption practices`);

    //     return {
    //       message: "Best Practices fetched successfully",
    //       status: 200,
    //       farmVisits: farmVisits.map(async (bp) => {
    //         return {
    //           // bp_id: bp.Id,
    //           fv_id: bp.Farm_Visit__c,
    //           fv_name: bp.Farm_Visit__r.Name,
    //           training_group: bp.Farm_Visit__r.Training_Group__r.Name,
    //           training_session: "j",
    //           tns_id: bp.Farm_Visit__r.Training_Group__r.TNS_Id__c,
    //           farm_visited: bp.Farm_Visit__r.Farm_Visited__r.Name,
    //           household_id: bp.Farm_Visit__r.Household_PIMA_ID__c,
    //           farmer_trainer: bp.Farm_Visit__r.Farmer_Trainer__r.Name,
    //           has_training: "123",
    //           date_visited: bp.Farm_Visit__r.Date_Visited__c,
    //           status: "not_reviewed",
    //           qas: [
    //             {
    //               practice_name_id: "Compost",
    //               practice_name: "Compost",
    //               questions: [
    //                 "Do you have compost manure?",
    //                 "Take a photo of the compost manure",
    //                 "Status of the photo",
    //               ],
    //               answers: [
    //                 bp.Do_you_have_compost_manure__c,
    //                 await fetchImage(bp.photo_of_the_compost_manure__c),
    //                 !bp.Compost_Manure_Photo_Status__c
    //                   ? "not_verified"
    //                   : bp.Compost_Manure_Photo_Status__c,
    //               ],
    //             },
    //             {
    //               practice_name_id: "RecordBook",
    //               practice_name: "Record Book",
    //               questions: [
    //                 "Do you have a record book?",
    //                 "Are there records on the record book?",
    //                 "Take a photo of the record book",
    //                 "Status of the photo",
    //               ],
    //               answers: [
    //                 bp.do_you_have_a_record_book__c,
    //                 bp.are_there_records_on_the_record_book__c,
    //                 await fetchImage(bp.take_a_photo_of_the_record_book__c),
    //                 !bp.Record_Book_Photo_Status__c
    //                   ? "not_verified"
    //                   : bp.Record_Book_Photo_Status__c,
    //               ],
    //             },
    //             {
    //               practice_name_id: "ErosionControl",
    //               practice_name: "Erosion Control",
    //               questions: [
    //                 "Erosion Control Methods Seen",
    //                 "Take a photo of erosion control",
    //                 "Status of the photo",
    //               ],
    //               answers: [
    //                 await getFVMethods("Erosion Control", bp.Id, sf_conn),
    //                 await fetchImage(bp.take_a_photo_of_erosion_control__c),
    //                 !bp.Erosion_Control_Photo_Status__c
    //                   ? "not_verified"
    //                   : bp.Erosion_Control_Photo_Status__c,
    //               ],
    //             },
    //             {
    //               practice_name_id: "IPDM",
    //               practice_name: "IPDM",
    //               questions: ["Pest and Disease Management: Methods Used"],
    //               answers: [
    //                 getFVMethods(
    //                   "Management of Coffee Berry Borer (CBB)",
    //                   bp.Id,
    //                   sf_conn
    //                 ),
    //               ],
    //             },
    //             {
    //               practice_name_id: "Nutrition",
    //               practice_name: "Nutrition",
    //               questions: [
    //                 "Colour of the coffee  leaves in the field",
    //                 "Chemicals and Fertilizers Applied",
    //               ],
    //               answers: [
    //                 bp.Color_of_coffee_tree_leaves__c,
    //                 getFVMethods(
    //                   "Chemicals and Fertilizers Applied",
    //                   bp.Id,
    //                   sf_conn
    //                 ),
    //               ],
    //             },
    //             {
    //               practice_name_id: "Shade",
    //               practice_name: "Shade Management",
    //               questions: [
    //                 "What is the level of shade present on the farm?",
    //                 "Take a photo of the level of shade on the plot",
    //                 "Status of the photo",
    //               ],
    //               answers: [
    //                 bp.level_of_shade_present_on_the_farm__c,
    //                 await fetchImage(bp.photo_of_level_of_shade_on_the_plot__c),
    //                 !bp.Level_Of_Shade_Plot_Photo_Status__c
    //                   ? "not_verified"
    //                   : bp.Level_Of_Shade_Plot_Photo_Status__c,
    //               ],
    //             },
    //             {
    //               practice_name_id: "Weeding",
    //               practice_name: "Weeding",
    //               questions: [
    //                 "Has the coffee field been dug, including under the canopy?",
    //                 "How many weeds are under the canopy and how big are they?",
    //                 "Take a photo of the weeds under the canopy",
    //                 "Status of the photo",
    //               ],
    //               answers: [
    //                 bp.has_coffee_field_been_dug__c,
    //                 bp.how_many_weeds_under_canopy_and_how_big__c,
    //                 await fetchImage(bp.photo_of_weeds_under_the_canopy__c),
    //                 !bp.Weeds_Under_Canopy_Photo_Status__c
    //                   ? "not_verified"
    //                   : bp.Weeds_Under_Canopy_Photo_Status__c,
    //               ],
    //             },
    //             {
    //               practice_name_id: "Stumping",
    //               practice_name: "Stumping",
    //               questions: [
    //                 "Has the farmer stumped any coffee trees in the field visited since training started?",
    //                 "Which year did you stump some trees in this field?",
    //                 "On average, how many main stems are on the stumped trees?",
    //                 "Status of the photo",
    //               ],
    //               answers: [
    //                 bp.how_many_weeds_under_canopy_and_how_big__c,
    //                 bp.year_stumping__c,
    //                 bp.main_stems_in_majority_coffee_trees__c,
    //                 await fetchImage(bp.photos_of_stumped_coffee_trees__c),
    //                 !bp.Stumping_Photo_Status__c
    //                   ? "not_verified"
    //                   : bp.Stumping_Photo_Status__c,
    //               ],
    //             },
    //             // {
    //             //   practice_name_id: "SuckerSelection",
    //             //   practice_name: "Sucker Selection",
    //             //   questions: [
    //             //     "Has the farmer stumped any coffee trees in the field visited since training started?",
    //             //     "Which year did you stump some trees in this field?",
    //             //     "On average, how many main stems are on the stumped trees?",
    //             //     "Status of the photo",
    //             //   ],
    //             //   answers: [
    //             //     bp.how_many_weeds_under_canopy_and_how_big__c,
    //             //     bp.year_stumping__c,
    //             //     bp.main_stems_in_majority_coffee_trees__c,
    //             //     await fetchImage(bp.photos_of_stumped_coffee_trees__c),
    //             //     !bp.Stumping_Photo_Status__c
    //             //       ? "not_verified"
    //             //       : bp.Stumping_Photo_Status__c,
    //             //   ],
    //             // },
    //             {
    //               practice_name_id: "Pruning",
    //               practice_name: "Pruning",
    //               questions: ["Pruning Methods used"],
    //               answers: [getFVMethods("Pruning", bp.Id, sf_conn)],
    //             },

    //             {
    //               practice_name_id: "HealthofNewPlanting",
    //               practice_name: "Health of New Planting",
    //               questions: [
    //                 "What is the health of the new planting choice?",
    //                 "What is the color of the coffee tree leaves?",
    //               ],
    //               answers: [
    //                 bp.health_of_new_planting_choice__c,
    //                 bp.color_of_coffee_tree_leaves__c,
    //               ],
    //             },
    //             {
    //               practice_name_id: "MainStems",
    //               practice_name: "Main Stems",
    //               questions: [
    //                 "How many main stems are on the majority of the trees?",
    //                 "Take a photo of the trees and average main stems",
    //                 "Status of the photo",
    //               ],
    //               answers: [
    //                 bp.number_of_main_stems_on_majority_trees__c,
    //                 await fetchImage(
    //                   bp.photo_of_trees_and_average_main_stems__c
    //                 ),
    //                 !bp.Main_Stems_Photo_Status__c
    //                   ? "not_verified"
    //                   : bp.Main_Stems_Photo_Status__c,
    //               ],
    //             },
    //           ],
    //         };
    //       }),
    //     };
    //   } catch (err) {
    //     console.log(err);

    //     return {
    //       message: "Something went wrong",
    //       status: err.status,
    //     };
    //   }
    // },

    getFVQAsByProjectInExcel: async (
      _,
      { project_id, practice_name },
      { sf_conn }
    ) => {
      try {
        // Query to fetch Training Groups based on Project ID
        const groupsQuery = await sf_conn.query(
          `SELECT Id FROM Training_Group__c WHERE Project__c = '${project_id}' LIMIT 1`
        );

        // If no groups found, throw error or handle appropriately
        if (groupsQuery.totalSize === 0) {
          throw new Error("Training Groups not found");
        }

        // Extract Training Group IDs
        const tg_ids = groupsQuery.records.map((group) => group.Id);

        // Convert IDs to string for query
        const tg_ids_string = tg_ids.map((id) => `'${id}'`).join(", ");

        let fields = [];

        switch (practice_name) {
          case "Compost":
            fields.push({
              field: "Do_you_have_compost_manure__c",
              question: "Do you have compost manure?",
              picture: "photo_of_the_compost_manure__c",
              isVerified: "Compost_Manure_Photo_Status__c",
            });
            break;
          case "Record Book":
            fields.push({
              field: "are_there_records_on_the_record_book__c",
              question: "Are there records on the record book?",
              picture: "take_a_photo_of_the_record_book__c",
              isVerified: "Record_Book_Photo_Status__c",
            });
            break;
          case "Erosion Control":
            break;
        }

        const fields_bp_string = fields.map((field) => field.field).join(", ");
        const fields_picture_string = fields
          .map((field) => field.picture)
          .join(", ");
        const fields_status_string = fields
          .map((field) => field.isVerified)
          .join(", ");

        // Query to fetch Best Practices for Farm Visits within selected Training Groups
        const query = `
          SELECT Id, Name, Best_Practice_Adoption__c, Farm_Visit__c,
                 Farm_Visit__r.Name, Farm_Visit__r.Training_Group__r.Name,
                 Farm_Visit__r.Training_Group__r.TNS_Id__c, Farm_Visit__r.Training_Session__r.Name,
                 Farm_Visit__r.Farm_Visited__r.Name, Farm_Visit__r.Household_PIMA_ID__c,
                 Farm_Visit__r.Farm_Visited__r.TNS_Id__C,
                 Farm_Visit__r.Farmer_Trainer__r.Name, Farm_Visit__r.Farmer_Trainer__c,
                 Farm_Visit__r.Date_Visited__c,
                 ${fields_bp_string},
                 ${fields_picture_string},
                 ${fields_status_string}
          FROM FV_Best_Practices__c 
          WHERE Farm_Visit__r.Training_Group__c IN (${tg_ids_string}) LIMIT 5
        `;

        console.log(query);

        // Execute the query to fetch farm visits data
        const result = await sf_conn.query(query);

        // If no farm visits found, throw error or handle appropriately
        if (result.totalSize === 0) {
          throw new Error("Farm Visits not found");
        }

        // Map fetched data to an array of objects
        const farmVisits = result.records.map(async (bp) => {
          const visit = {
            "Farmer PIMA ID": bp.Farm_Visit__r.Farm_Visited__c,
            "Farmer TNS ID": bp.Farm_Visit__r.Farm_Visited__r.TNS_Id__c,
            "Date Visited": bp.Farm_Visit__r.Date_Visited__c,
            "Farmer Name": bp.Farm_Visit__r.Farm_Visited__r.Name,
            "Farmer Trainer": bp.Farm_Visit__r.Farmer_Trainer__r.Name,
            "Correct Answer": "",
          };

          for (const field of fields) {
            visit[`${practice_name}: ${field.question}`] = bp[field.field];
            visit[
              `${practice_name}: Review: Correct Answer? (not_approved/approved/invalid)`
            ] = bp[field.isVerified];
            visit[`${practice_name}: ${field.picture}`] =
              await fetchImageWithRetry(bp[field.picture]);
          }

          return visit;
        });

        // Wait for all async operations to complete
        const resolvedFarmVisits = await Promise.all(farmVisits);

        // Create a new workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Farm Visits");

        // Set headers dynamically
        const columns = [
          { header: "Farmer PIMA ID", key: "Farmer PIMA ID", width: 30 },
          { header: "Farmer TNS ID", key: "Farmer TNS ID", width: 30 },
          { header: "Date Visited", key: "Date Visited", width: 30 },
          { header: "Farmer Name", key: "Farmer Name", width: 30 },
          { header: "Farmer Trainer", key: "Farmer Trainer", width: 30 },
          { header: "Correct Answer", key: "Correct Answer", width: 30 },
        ];

        fields.forEach((field) => {
          columns.push({
            header: `${practice_name}: ${field.question}`,
            key: `${practice_name}: ${field.question}`,
            width: 30,
          });
          columns.push({
            header: `${practice_name} Review: Correct Answer? (not_approved/approved/invalid)`,
            key: `${practice_name}: Review: Correct Answer? (not_approved/approved/invalid)`,
            width: 30,
          });
          columns.push({
            header: `${practice_name}: ${field.picture}`,
            key: `${practice_name}: ${field.picture}`,
            width: 30,
          });
        });

        worksheet.columns = columns;

        // Set row height
        worksheet.eachRow((row, rowNumber) => {
          row.height = 300;
        });

        // Add rows
        resolvedFarmVisits.forEach((visit, index) => {
          worksheet.addRow(visit);

          // Add images if available
          fields.forEach((field) => {
            const imageData = visit[`${practice_name}: ${field.picture}`];
            if (imageData) {
              try {
                const imageId = workbook.addImage({
                  base64: imageData.replace("data:image/png;base64,", ""),
                  extension: "png",
                });

                // Add image to the worksheet
                worksheet.addImage(imageId, {
                  tl: {
                    col: columns.findIndex(
                      (col) => col.key === `${practice_name}: ${field.picture}`
                    ),
                    row: index + 2,
                  },
                  ext: { width: 300, height: 300 },
                });
              } catch (error) {
                console.error(
                  `Error adding image for ${visit["Farm Visit ID"]}: ${error.message}`
                );
              }
            }
          });
        });

        // Convert workbook to buffer
        const buffer = await workbook.xlsx.writeBuffer();

        return {
          message: "File generated successfully",
          status: 200,
          file: `data:image/excel;base64,${buffer.toString("base64")}`,
        };
      } catch (err) {
        console.error("Error creating Excel file:", err);
        throw err; // Handle error as needed in your application
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

export default FarmVisitsResolvers;
