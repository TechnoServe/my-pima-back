import { gql } from "apollo-server-express";

const TrainingSessionsTypeDefs = gql`
  scalar Date
  scalar Decimal

  type TrainingSession {
    ts_id: ID!
    ts_name: String!
    ts_module: String
    ts_group: String
    tns_id: String
    farmer_trainer: String
    ts_status: String!
    total_males: Int
    total_females: Int
    session_image: String
    has_image: Boolean
    session_image_status: String
    is_verified: Boolean
    session_date: String
  }

  type Query {
    trainingSessionsByProject(
      sf_project_id: String!
    ): AllTrainingSessionsResponse
    trainingSessionsByGroup(tg_id: String!): AllTrainingSessionsResponse
    trainingSessionImage(ts_id: ID!): TrainingSessionImageResponse
    sampledTrainingSessions(sf_project_id: String!): [SampledSession]
    generateTSApprovalReport(projectId: String!, startDate: String, endDate: String, status: String): FileExport
  }

  type Mutation {
    validateSession(input: [SessionReviewInput!]!): BatchResponse
  }

  input SessionReviewInput {
    sessionId: String!
    status: String!
    userId: String!
  }

  type BatchResponse {
    status: Int
    message: String
  }

  type SampledSession {
    id: String!
    training_module_name: String!
    tg_name: String!
    tg_tns_id: String!
    total_attendance: Int!
    male_attendance: Int!
    female_attendance: Int!
    farmer_trainer_name: String!
    session_image_url: String!
    session_date: Date!
    image_review_result: String
    ts_latitude: Decimal
    ts_longitude: Decimal
  }

  type AllTrainingSessionsResponse {
    message: String!
    status: Int!
    trainingSessions: [TrainingSession]
  }

  type TrainingSessionResponse {
    message: String!
    status: Int!
    trainingSession: TrainingSession
  }

  type TrainingSessionImageResponse {
    message: String!
    status: Int!
    trainingSessionImage: String
  }
`;

export default TrainingSessionsTypeDefs;
