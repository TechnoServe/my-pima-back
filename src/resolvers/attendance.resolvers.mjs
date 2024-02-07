const AttendanceResolvers = {
  Query: {
    getAttendances: async (_, { project_id }, { sf_conn }) => {
      try {
        let records = [];

        let result = await sf_conn.query(
          "SELECT Id, Name, Participant__c, Participant_Gender__c, Attended__c, Training_Session__c, Date__c, Training_Session__r.Training_Module__r.Module_Title__c, Training_Session__r.Training_Module__r.Module_Number__c, Training_Session__r.Training_Module__c FROM Attendance__c WHERE Training_Session__r.Training_Group__r.Project__c = '" +
            project_id +
            "'"
        );

        records = records.concat(result.records);

        // Check if there are more records to retrieve
        while (result.done === false) {
          // Use queryMore to retrieve additional records
          result = await sf_conn.queryMore(result.nextRecordsUrl);
          records = records.concat(result.records);
        }

        if (records.length === 0) {
          return {
            message: "Attendance not found",
            status: 404,
          };
        }

        return {
          message: "Attendance fetched successfully",
          status: 200,
          attendance: records.map((attendance) => {
            return {
              attendance_id: attendance.Id,
              attendance_name: attendance.Name,
              participant_id: attendance.Participant__c,
              attendance_date: attendance.Date__c,
              attendance_status:
                attendance.Attended__c === 1 ? "Present" : "Absent",
              session_id: attendance.Training_Session__c,
              module_name:
                attendance.Training_Session__r.Training_Module__r
                  .Module_Title__c,
              module_number:
                attendance.Training_Session__r.Training_Module__r
                  .Module_Number__c,
              module_id: attendance.Training_Session__r.Training_Module__c,
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

    getAttendanceByParticipant: async (_, { participant_id }, { sf_conn }) => {
      try {
        const attendance = await sf_conn.query(
          "SELECT Id, Name, Participant__c, Participant_Gender__c, Attended__c, Training_Session__c, Date__c FROM Attendance__c WHERE Participant__c = '" +
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
  },
};

export default AttendanceResolvers;
