import Projects from "../models/projects.models.mjs";
import fetchImage from "../utils/commCareApi.mjs";

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

    getFVQAsByProjectForReview: async (_, { project_id }, { sf_conn }) => {
      try {
        const groups = await sf_conn.query(
          `SELECT Id FROM Training_Group__c WHERE Project__c = '${project_id}' LIMIT 1`
        );

        if (groups.totalSize === 0) {
          return {
            message: "Training Groups not found",
            status: 404,
          };
        }

        console.log(`found ${groups.totalSize} groups`);
        console.log(groups.records);

        const tg_ids = groups.records.map((group) => group.Id);

        let farmVisits = [];

        let now = new Date();
        let dayOfWeek = now.getDay(); // 0 (Sunday) to 6 (Saturday)
        let startOfLastWeek = new Date(
          now.setDate(now.getDate() - dayOfWeek - 6)
        );
        startOfLastWeek.setHours(0, 0, 0, 0); // Start of the day
        let endOfLastWeek = new Date(startOfLastWeek);
        endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
        endOfLastWeek.setHours(23, 59, 59, 999); // End of the day

        let startOfLastWeekStr = startOfLastWeek.toISOString().slice(0, 10);
        let endOfLastWeekStr = endOfLastWeek.toISOString().slice(0, 10);

        const tg_ids_string = tg_ids.map((id) => `'${id}'`).join(", ");
        const query = `
              SELECT Id, Name, Best_Practice_Adoption__c, Farm_Visit__c,
                    Farm_Visit__r.Name, Farm_Visit__r.Training_Group__r.Name, 
                    Farm_Visit__r.Training_Group__r.TNS_Id__c, Farm_Visit__r.Training_Session__r.Name, 
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
              WHERE Farm_Visit__r.Training_Group__c IN (${tg_ids_string}) 
            `;

        //  AND Farm_Visit__r.Date_Visited__c >= ${startOfLastWeekStr}
        // AND Farm_Visit__r.Date_Visited__c <= ${endOfLastWeekStr}

        let result = await sf_conn.query(query);
        console.log(result);

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

        console.log(`found ${farmVisits.length} best adoption practices`);

        return {
          message: "Best Practices fetched successfully",
          status: 200,
          farmVisits: farmVisits.map(async (bp) => {
            return {
              // bp_id: bp.Id,
              fv_id: bp.Farm_Visit__c,
              fv_name: "name",
              training_group: "name",
              training_group: "j",
              training_session: "j",
              tns_id: "123",
              farm_visited: "123",
              household_id: "123",
              farmer_trainer: "123",
              has_training: "123",
              date_visited: "123",
              qas: [
                {
                  practice_name_id: "Compost",
                  practice_name: "Compost",
                  questions: [
                    "Do you have compost manure?",
                    "Take a photo of the compost manure",
                    "Status of the photo",
                  ],
                  answers: [
                    bp.Do_you_have_compost_manure__c,
                    await fetchImage(bp.photo_of_the_compost_manure__c),
                    !bp.Compost_Manure_Photo_Status__c
                      ? "not_verified"
                      : bp.Compost_Manure_Photo_Status__c,
                  ],
                },
                {
                  practice_name_id: "RecordBook",
                  practice_name: "Record Book",
                  questions: [
                    "Do you have a record book?",
                    "Are there records on the record book?",
                    "Take a photo of the record book",
                    "Status of the photo",
                  ],
                  answers: [
                    bp.do_you_have_a_record_book__c,
                    bp.are_there_records_on_the_record_book__c,
                    await fetchImage(bp.take_a_photo_of_the_record_book__c),
                    !bp.Record_Book_Photo_Status__c
                      ? "not_verified"
                      : bp.Record_Book_Photo_Status__c,
                  ],
                },
                {
                  practice_name_id: "ErosionControl",
                  practice_name: "Erosion Control",
                  questions: [
                    "Erosion Control Methods Seen",
                    "Take a photo of erosion control",
                    "Status of the photo",
                  ],
                  answers: [
                    await getFVMethods("Erosion Control", bp.Id, sf_conn),
                    await fetchImage(bp.take_a_photo_of_erosion_control__c),
                    !bp.Erosion_Control_Photo_Status__c
                      ? "not_verified"
                      : bp.Erosion_Control_Photo_Status__c,
                  ],
                },
                {
                  practice_name_id: "IPDM",
                  practice_name: "IPDM",
                  questions: ["Pest and Disease Management: Methods Used"],
                  answers: [
                    getFVMethods(
                      "Management of Coffee Berry Borer (CBB)",
                      bp.Id,
                      sf_conn
                    ),
                  ],
                },
                {
                  practice_name_id: "Nutrition",
                  practice_name: "Nutrition",
                  questions: [
                    "Colour of the coffee  leaves in the field",
                    "Chemicals and Fertilizers Applied",
                  ],
                  answers: [
                    bp.Color_of_coffee_tree_leaves__c,
                    getFVMethods(
                      "Chemicals and Fertilizers Applied",
                      bp.Id,
                      sf_conn
                    ),
                  ],
                },
                {
                  practice_name_id: "Shade",
                  practice_name: "Shade Management",
                  questions: [
                    "What is the level of shade present on the farm?",
                    "Take a photo of the level of shade on the plot",
                    "Status of the photo",
                  ],
                  answers: [
                    bp.level_of_shade_present_on_the_farm__c,
                    await fetchImage(bp.photo_of_level_of_shade_on_the_plot__c),
                    !bp.Level_Of_Shade_Plot_Photo_Status__c
                      ? "not_verified"
                      : bp.Level_Of_Shade_Plot_Photo_Status__c,
                  ],
                },
                {
                  practice_name_id: "Weeding",
                  practice_name: "Weeding",
                  questions: [
                    "Has the coffee field been dug, including under the canopy?",
                    "How many weeds are under the canopy and how big are they?",
                    "Take a photo of the weeds under the canopy",
                    "Status of the photo",
                  ],
                  answers: [
                    bp.has_coffee_field_been_dug__c,
                    bp.how_many_weeds_under_canopy_and_how_big__c,
                    await fetchImage(bp.photo_of_weeds_under_the_canopy__c),
                    !bp.Weeds_Under_Canopy_Photo_Status__c
                      ? "not_verified"
                      : bp.Weeds_Under_Canopy_Photo_Status__c,
                  ],
                },
                {
                  practice_name_id: "Stumping",
                  practice_name: "Stumping",
                  questions: [
                    "Has the farmer stumped any coffee trees in the field visited since training started?",
                    "Which year did you stump some trees in this field?",
                    "On average, how many main stems are on the stumped trees?",
                    "Status of the photo",
                  ],
                  answers: [
                    bp.how_many_weeds_under_canopy_and_how_big__c,
                    bp.year_stumping__c,
                    bp.main_stems_in_majority_coffee_trees__c,
                    await fetchImage(bp.photos_of_stumped_coffee_trees__c),
                    !bp.Stumping_Photo_Status__c
                      ? "not_verified"
                      : bp.Stumping_Photo_Status__c,
                  ],
                },
                // {
                //   practice_name_id: "SuckerSelection",
                //   practice_name: "Sucker Selection",
                //   questions: [
                //     "Has the farmer stumped any coffee trees in the field visited since training started?",
                //     "Which year did you stump some trees in this field?",
                //     "On average, how many main stems are on the stumped trees?",
                //     "Status of the photo",
                //   ],
                //   answers: [
                //     bp.how_many_weeds_under_canopy_and_how_big__c,
                //     bp.year_stumping__c,
                //     bp.main_stems_in_majority_coffee_trees__c,
                //     await fetchImage(bp.photos_of_stumped_coffee_trees__c),
                //     !bp.Stumping_Photo_Status__c
                //       ? "not_verified"
                //       : bp.Stumping_Photo_Status__c,
                //   ],
                // },
                {
                  practice_name_id: "Pruning",
                  practice_name: "Pruning",
                  questions: ["Pruning Methods used"],
                  answers: [getFVMethods("Pruning", bp.Id, sf_conn)],
                },

                {
                  practice_name_id: "HealthofNewPlanting",
                  practice_name: "Health of New Planting",
                  questions: [
                    "What is the health of the new planting choice?",
                    "What is the color of the coffee tree leaves?",
                  ],
                  answers: [
                    bp.health_of_new_planting_choice__c,
                    bp.color_of_coffee_tree_leaves__c,
                  ],
                },
                {
                  practice_name_id: "MainStems",
                  practice_name: "Main Stems",
                  questions: [
                    "How many main stems are on the majority of the trees?",
                    "Take a photo of the trees and average main stems",
                    "Status of the photo",
                  ],
                  answers: [
                    bp.number_of_main_stems_on_majority_trees__c,
                    await fetchImage(
                      bp.photo_of_trees_and_average_main_stems__c
                    ),
                    !bp.Main_Stems_Photo_Status__c
                      ? "not_verified"
                      : bp.Main_Stems_Photo_Status__c,
                  ],
                },
              ],
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
        return `<li>${bpResult.Best_Practice_Result_Description__c}</li>`;
      })
      .join("\n");

    // Wrap the HTML-formatted text with <ul> (unordered list) tags
    return `<ul>${htmlFormattedText}</ul>`;
  } catch (error) {
    console.log(error);

    return {
      message: error.message,
      status: error.status,
    };
  }
};

export default FarmVisitsResolvers;
