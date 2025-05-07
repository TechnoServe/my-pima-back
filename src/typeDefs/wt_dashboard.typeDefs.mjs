import { gql } from "apollo-server-express";

const dashboardTypeDefs = gql`
  """
  One entry in the Operations slice:
  - issue: the CWS processing issue
  - averageRank: the mean ranking (1 = most problematic)
  - reasons: up to 3 comments explaining severity
  """
  type OperationNeed {
    rank: Int!
    issue: String!
    reason: String
  }

  type InfrastructureChecklist {
    items: [String!]!
    goodItems: [String!]!
    repairItems: [String!]!
  }

  type FinancialBreakdown {
    totalProfit: Float!
    reserves: Float!
    socialActivities: Float!
    secondPaymentToFarmers: Float!
  }

  type EmployeeStats {
    menOwnership: Int!
    womenOwnership: Int!
    menFarmers: Int!
    womenFarmers: Int!
    menPermanent: Int!
    womenPermanent: Int!
    menTemporary: Int!
    womenTemporary: Int!
    menDaily: Int!
    womenDaily: Int!
  }

  #############################
  # CPQI Stats (graphs)
  #############################
  type CPQISectionStat {
    sectionName: String!
    yesPct: Float!
    noPct: Float!
  }

  type CPQIStats {
    sections: [CPQISectionStat!]!
    overallYesPct: Float!
    overallNoPct: Float!
  }

  #############################
  # CPQI Checklist (list)
  #############################
  type CPQICriterion {
    questionName: String!
    yes: Boolean!
  }

  type CPQISectionChecklist {
    sectionName: String!
    criteria: [CPQICriterion!]!
  }

  type TrainingTopicAttendance {
    topic:  String!
    male:   Int!
    female: Int!
 }

  type TrainingAttendanceOverall {
    male:   Int!
    female: Int!
 }

  extend type Query {
    getOperationsRanking(wetmillId: ID!): [OperationNeed!]!
    getMissingDocuments(wetmillId: ID!): [String!]!
    getInfrastructureChecklist(wetmillId: ID!): InfrastructureChecklist!
    getFinancialBreakdown(wetmillId: ID!): FinancialBreakdown!
    getEmployeeStats(wetmillId: ID!): EmployeeStats!
    getCpqiStats(wetmillId: ID!): CPQIStats!
    getCpqiChecklist(wetmillId: ID!): [CPQISectionChecklist!]!
    getTrainingAttendanceByTopic(wetmillId: ID!): [TrainingTopicAttendance!]!
    getTrainingAttendanceOverall(wetmillId: ID!): TrainingAttendanceOverall!
  }
`;

export default dashboardTypeDefs;
