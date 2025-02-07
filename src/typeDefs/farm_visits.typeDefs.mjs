import { gql } from "apollo-server-express";

const FarmVisitsTypeDefs = gql`
  scalar Date
  type FarmVisit {
    fv_id: String!
    fv_name: String
    training_group: String!
    training_session: String
    tg_tns_id: String
    farmer_tns_id: String
    household_tns_id: String
    farm_visited: String
    household_id: String
    farmer_trainer: String!
    has_training: String!
    date_visited: String!
    status: String
    pima_household_id: String
    pima_farmer_id: String
    gender: String
    qas: [QA]
  }

  type QA {
    practice_name_id: String!
    practice_name: String!
    questions: [String]
    answers: [String]
  }

  type Query {
    getFarmVisitsByProject(project_id: String!): AllFarmVisitsResponse
    getFarmVisitsByGroup(tg_id: String!): AllFarmVisitsResponse
    getFarmVisitsBySession(ts_id: String!): AllFarmVisitsResponse
    getFarmVisitsByParticipant(part_id: String!): AllFarmVisitsResponse
    getFVQAsByProjectForReview(
      project_id: String!
      limit: Int
      offset: Int
    ): AllFarmVisitsResponse
    getFVQAsByHousehold(project_id: String!): [getFVQAsByHouseholdResponse]
    getFVQAsByProjectInExcel(
      project_id: String!
      practice_name: String!
    ): FileExport
    getSampledVisitsStats(projectId: String!): VisitStats
    getBestPracticeReviewStats(
      projectId: String!
      practiceName: String!
    ): PracticeStats
    getPaginatedReviews(
      projectId: String!
      practiceName: String!
      page: Int!
      pageSize: Int!
    ): [FarmVisit2]
    generateFarmVisitReport(projectId: String!): FileExport
  }

  type VisitStats {
    totalSampledVisits: Int
    totalReviewed: Int
    remainingVisits: Int
  }

  type PracticeStats {
    reviewedVisits: Int
    remainingVisits: Int
    totalVisits: Int
  }

  type FarmVisit2 {
    visit_id: ID!
    sf_visit_id: String
    farmer_name: String
    farmer_pima_id: String
    farmer_tns_id: String
    date_visited: Date!
    farmer_trainer: String
    BestPractices: [BestPractice]
  }

  type BestPractice {
    practice_id: ID!
    practice_name: String
    image_url: String
    sf_practice_id: String
    question: String
    answer: String
  }

  type Mutation {
    submitBatch(input: [BatchInput!]!): BatchResponse!
  }

  input BatchInput {
    practice_id: ID!
    correct_answer: String!
    comment: String
    user_id: ID!
  }

  type BatchResponse {
    success: Boolean!
    message: String
  }
  type getFVQAsByHouseholdResponse {
    FV_SF_ID: String!
    gender: String!
    fieldAge: Int
    curedas: String
    separateFields: String
    ffg_tns_id: String!
    ffg_name: String!
    farmer_tns_id: String!
    household_id: String!
    date_visited: String!
    Location_GPS__c: String
    compost: String
    hasRecordBook: String
    recordOnBook: String
    levelOfShade: String
    hasCoffeeFieldBeenDug: String
    how_many_weeds_under_canopy_and_how_big__c: String
    color_of_coffee_tree_leaves__c: String
    number_of_main_stems_on_majority_trees__c: String
    Have_herbicides_been_used_on_the_field__c: String
    planted_intercrop_bananas__c: String
    health_of_new_planting_choice__c: String
    stumping_method_on_majority_of_trees__c: String
    number_of_trees_stumped__c: String
    usedPesticide: String
    pesticidenumberOfTimes: String
    pesticideSprayType: String
    MainStemsEthiopia: String
    yearOfStumping: String
    erosionMethods: String
    ipdmMethods: String
    nutritionMethods: String
    pruningMethods: String
    Compost_Pass: String
    RecordBook_Pass: String
    Shade_Pass: String
    Weeding_Pass: String
    Nutrition_Pass: String
    Rejuvenation_Pass: String
    Stumping_Pass: String
    PesticideUse_Pass: String
    IPDM_Pass: String
    Pruning_Pass: String
    ErosionControl_Pass: String
  }

  type FileExport {
    message: String!
    status: Int!
    file: String
  }

  type AllFarmVisitsResponse {
    message: String!
    status: Int!
    farmVisits: [FarmVisit]
  }
`;

export default FarmVisitsTypeDefs;
