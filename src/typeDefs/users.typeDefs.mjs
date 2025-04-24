import { gql } from "apollo-server-express";

const usersTypeDefs = gql`
  type BusinessAdvisor {
    id: ID!
    name: String
    wetmillId: ID
  }

  type BusinessAdvisorsResponse {
    message: String!
    status: Int!
    advisors: [BusinessAdvisor]
  }
    
  type User {
    user_id: ID
    sf_user_id: String
    user_name: String
    user_email: String
    mobile_no: String
    role_id: String
    role: Roles
    account_status: String
    createdAt: String
    updatedAt: String
  }

  type Query {
    loadSFUsers: LoadUsersResponse
    getUsers: UsersResponse
    getUserById(user_id: ID!): UserResponse
    getUserBySFId(sf_user_id: String!): UserResponse
    getWetMillBusinessAdvisors(sfProjectId: String!): BusinessAdvisorsResponse
  }

  type LoadUsersResponse {
    message: String!
    status: Int!
    total_new_users: Int
  }

  type Mutation {
    addUser(
      user_name: String!
      user_email: String!
      mobile_no: String!
      user_password: String!
      role_id: ID
    ): UserResponse

    updateUser(
      user_id: ID!
      user_name: String
      user_email: String
      mobile_no: String
      role_id: ID
      account_status: String
    ): UserResponse

    forgotPassword(user_email: String!): UserResponse

    deleteUser(user_id: ID!): UserResponse
  }

  type UsersResponse {
    message: String!
    status: Int!
    users: [User]
  }

  type UserResponse {
    message: String!
    status: Int!
    user: User
  }
`;

export default usersTypeDefs;
