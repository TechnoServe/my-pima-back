import { gql } from "apollo-server-express";

const ParticipantsTypeDefs = gql`
  scalar Upload

  type Participant {
    p_id: String!
    first_name: String
    middle_name: String
    last_name: String
    gender: String
    age: String
    coffee_tree_numbers: String
    hh_number: String
    ffg_id: String!
    location: String!
    tns_id: String!
    status: String!
    farmer_trainer: String!
    business_advisor: String!
    project_name: String!
    training_group: String!
    household_id: String
    primary_household_member: String
    create_in_commcare: String!
    coop_membership_number: String
    phone_number: String
  }

  type Query {
    getParticipantsByProject(project_id: String!): AllParticipantsResponse
    getParticipantsByGroup(tg_id: String!): AllParticipantsResponse
  }

  type Mutation {
    uploadParticipants(parts_file: Upload!): UploadResponse
    syncParticipantsWithCOMMCARE(project_id: String!): UploadResponse
  }

  type AllParticipantsResponse {
    message: String!
    status: Int!
    participants: [Participant]
  }

  type UploadResponse {
    message: String!
    status: Int!
  }
`;

export default ParticipantsTypeDefs;
