import { gql } from "apollo-server-express";

const wetmillsTypeDefs = gql`
  type Wetmill {
    id: ID
    wet_mill_unique_id: String
    commcare_case_id: String
    name: String
    mill_status: String
    exporting_status: String
    programe: String
    country: String
    manager_name: String
    manager_role: String
    comments: String
    wetmill_counter: Int
    ba_signature: String
    manager_signature: String
    tor_page_picture: String
    registration_date: String
    created_at: String
    updated_at: String
  }

  type WetmillsResponse {
    message: String!
    status: Int!
    wetmills: [Wetmill]
  }
  
  type SurveyExcel {
    filename: String!
    contentBase64: String!
  }


  extend type Query {
    getWetmills(program: String!): WetmillsResponse
    exportWetMillsDataExcel(program: String!): SurveyExcel!
  }
`;

export default wetmillsTypeDefs;
