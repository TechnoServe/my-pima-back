import { gql } from "apollo-server-express";

const AttendanceTypeDefs = gql`
  type Attendance {
    attendance_id: String!
    participant_id: String!
    attendance_name: String!
    module_name: String
    module_number: String!
    attendance_date: String
    attendance_status: String!
    session_id: String!
    module_id: String!
  }

  type Query {
    getAttendances(project_id: String!, limit: Int, offset: Int): AllAttendanceResponse
    getAttendanceByParticipant(participant_id: String!): AllAttendanceResponse
    getAttendanceBySession(session_id: String!): AllAttendanceResponse
    getAttendanceStatisticsBySession(
      session_id: String!
    ): AttendanceStatisticsResponse
  }

  type AllAttendanceResponse {
    message: String!
    status: Int!
    attendance: [Attendance]
  }

  type AttendanceStatisticsResponse {
    message: String!
    status: Int!
    attendance_statistics: AttendanceStatistics
  }

  type AttendanceStatistics {
    total_attendance: Int!
    total_present: Int!
    total_absent: Int!
    male_present: Int!
    female_present: Int!
  }
`;

export default AttendanceTypeDefs;
