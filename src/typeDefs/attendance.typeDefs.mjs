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

  type AttendanceEvidence {
    attendanceId: ID
    trainingDate: String
    moduleName: String
    currentPreviousModule: String
    attended: Boolean
  }

  type AttendanceSide {
    countAttended: Int
    anyAttended: Boolean
    attendedPreviousModule: Boolean
    evidence: [AttendanceEvidence!]!
  }

  type CheckSide {
    recordId: ID
    numberOfTrainingsAttended: Int
    attendedAnyTrainings: Boolean
    attendedLastMonthsTraining: Boolean
    farmVisit: Boolean!      # NEW
    observation: Boolean!    # NEW
  }

  type AttendanceComparisonMatches {
    countEqual: Boolean                  # May be null if not applicable
    anyEqual: Boolean                    # May be null if not applicable
    previousModuleEqual: Boolean
  }

  type AttendanceComparisonItem {
    participantId: ID!
    tnsId: String
    firstName: String
    lastName: String
    trainingGroupName: String
    check: CheckSide
    attendance: AttendanceSide
    matches: AttendanceComparisonMatches
  }

  type AttendanceComparisonTotals {
    total: Int!
    matches: Int!
    mismatches: Int!
  }

  type AttendanceComparisonResponse {
    status: Int!
    totals: AttendanceComparisonTotals!
    items: [AttendanceComparisonItem!]!
  }

  type Query {
    getAttendances(project_id: String!): AllAttendanceResponse
    getAttendanceByParticipant(participant_id: String!): AllAttendanceResponse
    getAttendanceBySession(session_id: String!): AllAttendanceResponse
    getAttendanceStatisticsBySession(
      session_id: String!
    ): AttendanceStatisticsResponse
    getAttendanceCheckComparison(
      projectId: ID!
      search: String
      tgIds: [ID!]
      onlyMismatches: Boolean
    ): AttendanceComparisonResponse!
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