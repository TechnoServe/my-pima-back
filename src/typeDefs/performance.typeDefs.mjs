import { gql } from "apollo-server-express";
const PerformanceTypeDefs = gql`

  type Query {
    getPerformanceByAA(project_id: String): AAResponse
  }

  type AAResponse {
    message: String!
    status: Int!
    data: [BusinessAdvisors]
  }

  type BusinessAdvisors {
    id: String
    name: String
  }
`;

export default PerformanceTypeDefs;
