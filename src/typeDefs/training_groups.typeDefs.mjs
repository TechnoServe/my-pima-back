import { gql } from "apollo-server-express";

const TrainingGroupsTypeDefs = gql`
    type TrainingGroup {
        tg_id: ID!
        tg_name: String!
        tns_id: String!
        total_participants: Int!
        farmer_trainer: String!
        business_advisor: String
    }

    query TrainingGroups {
        trainingGroups: AllTrainingGroupsResponse
        trainingGroup(tg_id: ID!): TrainingGroupResponse
    }

    type AllTrainingGroupsResponse {
        message: String!
        status: Int!
        trainingGroups: [TrainingGroup]
    }

    type TrainingGroupResponse {
        message: String!
        status: Int!
        trainingGroup: TrainingGroup
    }
`;

export default TrainingGroupsTypeDefs;
