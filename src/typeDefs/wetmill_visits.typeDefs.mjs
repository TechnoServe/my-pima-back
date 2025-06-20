// graphql/typeDefs/visits.typeDefs.mjs
import { gql } from "apollo-server-express";

const WetMillvisitsTypeDefs = gql`
  type Visit {
    id: ID!
    visited_at: String!
    wetmillId: ID!
  }

  type VisitsResponse {
    message: String!
    status: Int!
    visits: [Visit]!
  }

  extend type Query {
    getVisits(program: String!): VisitsResponse
  }
`;

export default WetMillvisitsTypeDefs;
