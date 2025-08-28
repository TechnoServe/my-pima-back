import Projects from "../models/projects.models.mjs";
import { AttendanceService } from "../services/attendance.service.mjs";
import { getAttendanceCheckComparison } from "../services/attendanceCheck.service.mjs";
import { AttendanceSyncService } from "../services/attendanceSync.service.mjs";

const AttendanceResolvers = {
  Query: {
    getAttendances: async (_, { project_id }, { sf_conn }) => {
      try {
        const project = await Projects.findOne({
          where: { sf_project_id: project_id, attendance_full: true },
        });

        if (project) {
          await AttendanceSyncService.syncFromSalesforce(project_id, sf_conn);
        }

        // now fetches from Postgres
        const attendanceData = await AttendanceService.fetchAttendance(
          project_id
        );

        if (!attendanceData || attendanceData.length === 0) {
          return {
            message: "Attendance not found",
            status: 404,
          };
        }

        return {
          message: "Attendance fetched successfully",
          status: 200,
          attendance: attendanceData.map((a) => ({
            attendance_id: a.salesforceId,
            attendance_name: a.name,
            participant_id: a.participantId,
            attendance_date: a.date,
            attendance_status: a.attended ? "Present" : "Absent",
            session_id: a.trainingSessionId,
            module_name: a.moduleName || "",
            module_number: a.moduleNumber != null ? a.moduleNumber : 0,
            module_id: a.moduleId || "",
          })),
        };
      } catch (error) {
        console.error(error);
        return {
          message: error.message,
          status: error.status || 500,
        };
      }
    },

    getAttendanceByParticipant: async (_, { participant_id }, { sf_conn }) => {
      try {
        const attendance = await sf_conn.query(
          "SELECT Id, Name, Participant__c, Participant_Gender__c,Training_Session__r.Training_Module__r.Module_Title__c, Attended__c, Training_Session__c, Date__c FROM Attendance__c WHERE Participant__c = '" +
            participant_id +
            "'"
        );

        if (attendance.totalSize === 0) {
          return {
            message: "Attendance not found",
            status: 404,
          };
        }

        return {
          message: "Attendance fetched successfully",
          status: 200,
          attendance: attendance.records.map((attendance) => {
            return {
              attendance_id: attendance.Id,
              attendance_name: attendance.Name,
              participant_id: attendance.Participant__c,
              module_name:
                attendance.Training_Session__r.Training_Module__r
                  .Module_Title__c,
              attendance_date: attendance.Date__c,
              attendance_status:
                attendance.Attended__c === 1 ? "Present" : "Absent",
              session_id: attendance.Training_Session__c,
            };
          }),
        };
      } catch (err) {
        console.log(err);

        return {
          message: err.message,
          status: err.status,
        };
      }
    },

    getAttendanceBySession: async (_, { session_id }, { sf_conn }) => {
      try {
        const attendance = await sf_conn.query(
          "SELECT Id, Name, Participant__c, Participant_Gender__c, Attended__c, Training_Session__c, Date__c FROM Attendance__c WHERE Training_Session__c = '" +
            session_id +
            "'"
        );

        if (attendance.totalSize === 0) {
          return {
            message: "Attendance not found",
            status: 404,
          };
        }

        return {
          message: "Attendance fetched successfully",
          status: 200,
          attendance: attendance.records.map((attendance) => {
            return {
              attendance_id: attendance.Id,
              attendance_name: attendance.Name,
              participant_id: attendance.Participant__c,
              attendance_date: attendance.Date__c,
              attendance_status:
                attendance.Attended__c === 1 ? "Present" : "Absent",
              session_id: attendance.Training_Session__c,
            };
          }),
        };
      } catch (error) {
        console.log(error);

        return {
          message: error.message,
          status: error.status,
        };
      }
    },

    getAttendanceStatisticsBySession: async (
      _,
      { session_id },
      { sf_conn }
    ) => {
      try {
        const attendance = await sf_conn.query(
          "SELECT Id, Name, Participant__c, Participant_Gender__c, Attended__c, Training_Session__c, Date__c FROM Attendance__c WHERE Training_Session__c = '" +
            session_id +
            "'"
        );

        if (attendance.totalSize === 0) {
          return {
            message: "Attendance not found",
            status: 404,
          };
        }

        const attendance_statistics = {
          total_attendance: attendance.totalSize,
          total_present: attendance.records.filter(
            (attendance) => attendance.Attended__c === 1
          ).length,
          total_absent: attendance.records.filter(
            (attendance) => attendance.Attended__c === 0
          ).length,
          male_present: attendance.records.filter(
            (attendance) => attendance.Participant_Gender__c === "m"
          ).length,
          female_present: attendance.records.filter(
            (attendance) => attendance.Participant_Gender__c === "f"
          ).length,
        };

        return {
          message: "Attendance fetched successfully",
          status: 200,
          attendance_statistics: attendance_statistics,
        };
      } catch (error) {
        console.log(error);

        return {
          message: error.message,
          status: error.status,
        };
      }
    },

    async getAttendanceCheckComparison(_, args, {sf_conn}) {

      const items = await getAttendanceCheckComparison(sf_conn, args);

      const totals = items.reduce(
        (acc, it) => {
          const allMatch =
            Boolean(it.matches?.countEqual) &&
            Boolean(it.matches?.anyEqual) &&
            Boolean(it.matches?.previousModuleEqual);
          acc.total += 1;
          if (allMatch) acc.matches += 1;
          else acc.mismatches += 1;
          return acc;
        },
        { total: 0, matches: 0, mismatches: 0 }
      );

      let filtered = items;
      if (args.onlyMismatches) {
        filtered = items.filter(
          (it) =>
            !(
              it.matches?.countEqual &&
              it.matches?.anyEqual &&
              it.matches?.previousModuleEqual
            )
        );
      }

      return { status: 200, totals, items: filtered };
    },
  },
};

export default AttendanceResolvers;
