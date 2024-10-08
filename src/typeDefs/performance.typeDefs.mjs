import { gql } from "apollo-server-express";
const PerformanceTypeDefs = gql`
  type Query {
    getPerformanceByAA(project_id: String): AAResponse
  }

  type Query {
    getPerformanceByFT(project_id: String): FTResponse
  }

  type AAResponse {
    message: String!
    status: Int
    data: [BusinessAdvisors]
  }

  type FTResponse {
    message: String!
    status: Int
    data: [FarmerTrainers]
  }

  type BusinessAdvisors {
    id: String!
    staffId: String!
    name: String!
    monthlyCounts: [ObservationData]
  }

  type FarmerTrainers {
    id: String!
    staffId: String!
    name: String!
    monthlyPerformance: [MonthlyFFGPerformance]
    monthlyVisitedFarms: [MonthlyVisitedFarms]
    monthlyRating: [MonthlyRating]
    monthlyAttDifference: [AttDifference]
  }

  type MonthlyFFGPerformance {
    month: String
    year: String
    percentage: Float!
  }

  type MonthlyVisitedFarms {
    month: String!
    year: String!
    totalVisitedFarms: Int!
  }

  type MonthlyRating {
    month: String!
    year: String!
    avgScore: Float!
  }

  type AttDifference {
    month: String
    year: String
    difference: String
    ftAttendance: Float
    aaAttendance: Float
  }

  type ObservationData {
    date: String!
    trainingCount: Int!
    dpoCount: Int!
  }
`;

export default PerformanceTypeDefs;
