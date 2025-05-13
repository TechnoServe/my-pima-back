import redis from "../config/redisClient.mjs";

export const AttendanceService = {
  async fetchAndCacheAttendance(projectId, sf_conn) {
    const cacheKey = `attendance:${projectId}`;
    const cachedData = await redis.get(cacheKey);

    if (cachedData) {
      console.log(
        `${JSON.parse(cachedData).length} Attendance data for project ${projectId} retrieved from cache`
      );
      return JSON.parse(cachedData);
    }
    else{
      console.log(`no cache.. Querying from SF`);
    }

    try {
      let records = [];
      let result = await sf_conn.query(`
            SELECT Id, Name, Participant__c, Participant_Gender__c, Attended__c, Training_Session__c, Date__c,
            Training_Session__r.Training_Module__r.Module_Title__c, Training_Session__r.Training_Module__r.Module_Number__c,
            Training_Session__r.Training_Module__c
            FROM Attendance__c
            WHERE Training_Session__r.Training_Group__r.Project__c = '${projectId}'
          `);

      records = records.concat(result.records);

      while (!result.done) {
        result = await sf_conn.queryMore(result.nextRecordsUrl);
        records = records.concat(result.records);
      }

      if (records.length > 30000) {
        await redis.set(cacheKey, JSON.stringify(records), "EX", 3600 * 8);
        console.log(`Attendance data for project ${projectId} cached`);
      }

      console.log(`Returning ${records.length} attendance records from SF`);

      return records;
    } catch (error) {
      console.error(
        `Error fetching attendance data for project ${projectId}:`,
        error
      );
      throw new Error("Failed to fetch attendance data");
    }
  },
  async cacheAttendanceData(sf_conn) {
    try {
      const projectIds = ["a0EOj000002RJS1MAO", "a0EOj000000VN5BMAW"];

      for (let projectId of projectIds) {
        await this.fetchAndCacheAttendance(projectId, sf_conn);
      }

      console.log("Attendance data cached successfully.");
    } catch (error) {
      console.error("Error caching attendance data:", error);
    }
  },
};
