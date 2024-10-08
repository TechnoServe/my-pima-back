const PerformanceResolvers = {
  Query: {
    getPerformanceByAA: async (_, { project_id }, { sf_conn }) => {
      try {
        // Query AAs (Business Advisors) for the given project
        const aaQueryResult = await sf_conn.query(`
          SELECT Id, Staff__c, Staff__r.Name
          FROM Project_Role__c
          WHERE Project__c = '${project_id}' AND Role__c = 'Business Advisor'
        `);
        const aas = aaQueryResult.records;

        // Collect all Staff__c IDs of AAs
        const aaIds = aas.map((aa) => aa.Staff__c);

        // Initialize observation counts by trainer ID and type
        const observationCountsByTrainerId = {};

        const batchSize = 500; // Adjust batch size as needed

        // Query observations for AAs in batches
        for (let i = 0; i < aaIds.length; i += batchSize) {
          const batchIds = aaIds.slice(i, i + batchSize);

          const observationsQueryResult = await sf_conn.query(`
            SELECT Trainer__r.ReportsToId, RecordType.Name, Date__c
            FROM Observation__c
            WHERE Trainer__r.ReportsToId IN ('${batchIds.join("','")}')
            AND Training_Group__r.Project__c = '${project_id}'
          `);
          const observations = observationsQueryResult.records;

          // Aggregate observations
          observations.forEach((observation) => {
            const trainerId = observation.Trainer__r.ReportsToId;
            const recordType = observation.RecordType.Name;

            // Increment counts based on record type
            if (!observationCountsByTrainerId[trainerId]) {
              observationCountsByTrainerId[trainerId] = {
                demoPlotCount: 0,
                trainingCount: 0,
                monthlyCounts: {},
              };
            }

            if (recordType === "Demo Plot") {
              observationCountsByTrainerId[trainerId].demoPlotCount++;
            } else if (recordType === "Training") {
              observationCountsByTrainerId[trainerId].trainingCount++;
            }

            // Extract year and month from observation date
            const observationDate = new Date(observation.Date__c);
            const observationYear = observationDate.getFullYear();
            const observationMonth = observationDate.toLocaleString("default", {
              month: "short",
            });

            // Combine month and year
            const monthYear = observationMonth + " " + observationYear;

            // Increment counts for the specific month
            if (
              !observationCountsByTrainerId[trainerId].monthlyCounts[monthYear]
            ) {
              observationCountsByTrainerId[trainerId].monthlyCounts[monthYear] =
                {
                  demoPlotCount: 0,
                  trainingCount: 0,
                };
            }
            if (recordType === "Demo Plot") {
              observationCountsByTrainerId[trainerId].monthlyCounts[monthYear]
                .demoPlotCount++;
            } else if (recordType === "Training") {
              observationCountsByTrainerId[trainerId].monthlyCounts[monthYear]
                .trainingCount++;
            }
          });
        }

        // Map aggregated observation counts to AAs and sort monthly counts
        const aaData = aas.map((aa) => {
          const trainerId = aa.Staff__c;
          const monthlyCounts =
            observationCountsByTrainerId[trainerId]?.monthlyCounts || {};
          const formattedMonthlyCounts = Object.entries(monthlyCounts)
            .map(([date, counts]) => ({
              date,
              trainingCount: counts.trainingCount || 0,
              dpoCount: counts.demoPlotCount || 0,
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date)); // Sort by date

          return {
            id: aa.Id,
            staffId: aa.Staff__c,
            name: aa.Staff__r.Name,
            monthlyCounts: formattedMonthlyCounts,
          };
        });

        return {
          message: "success",
          status: 200,
          data: aaData,
        };
      } catch (error) {
        console.log(error);
        return {
          message: error.message,
          status: error.status,
        };
      }
    },

    getPerformanceByFT: async (_, { project_id }, { sf_conn }) => {
      try {
        // Query Farmer Trainers for the given project along with their total FFGs
        const ftQueryResult = await sf_conn.query(`
          SELECT COUNT(Id) totalFFGs, Responsible_Staff__c, MAX(Responsible_Staff__r.Name) Name
          FROM Training_Group__c
          WHERE Group_Status__c = 'Active' AND Project__c = '${project_id}'
          GROUP BY Responsible_Staff__c
        `);
        const fts = ftQueryResult.records;

        // Collect all Trainer__c IDs of FTs
        const ftIds = fts.map((ft) => `'${ft.Responsible_Staff__c}'`).join(",");

        // Query to find total trained FFGs by FT per month
        const trainedFFGsQueryResult = await sf_conn.query(`
          SELECT COUNT(Id) totalTrainedFFGs, CALENDAR_MONTH(Training_Module__r.Date__c) month, CALENDAR_YEAR(Training_Module__r.Date__c) year, Trainer__c
          FROM Training_Session__c
          WHERE Trainer__c IN (${ftIds}) AND Date__c != null
          GROUP BY CALENDAR_MONTH(Training_Module__r.Date__c), CALENDAR_YEAR(Training_Module__r.Date__c), Trainer__c
          ORDER BY CALENDAR_YEAR(Training_Module__r.Date__c), CALENDAR_MONTH(Training_Module__r.Date__c)
        `);

        // Query to find total visited farms by FT per month
        const visitedFarmsQueryResult = await sf_conn.query(`
          SELECT COUNT(Id) totalVisitedFarms, CALENDAR_MONTH(Date_Visited__c) month, CALENDAR_YEAR(Date_Visited__c) year, Farmer_Trainer__c
          FROM Farm_Visit__c
          WHERE Farmer_Trainer__c IN (${ftIds})
          GROUP BY CALENDAR_MONTH(Date_Visited__c), CALENDAR_YEAR(Date_Visited__c), Farmer_Trainer__c
          ORDER BY CALENDAR_YEAR(Date_Visited__c), CALENDAR_MONTH(Date_Visited__c)
        `);

        // Query to find monthly rating for each FT
        const monthlyRatingQueryResult = await sf_conn.query(`
          SELECT Observation__r.Trainer__c, CALENDAR_YEAR(Observation__r.Training_Session__r.Training_Module__r.Date__c) Year, CALENDAR_MONTH(Observation__r.Training_Session__r.Training_Module__r.Date__c) Month, AVG(Score__c) Avg_Score
          FROM Observation_Result__c
          WHERE (RecordType.Name = 'Participant Feedback' OR RecordType.Name = 'Training Observation') 
                AND Observation__r.Trainer__c IN (${ftIds}) AND Observation__r.Training_Session__r.Training_Module__r.Date__c !=           null
                GROUP BY Observation__r.Trainer__c, CALENDAR_MONTH(Observation__r.Training_Session__r.Training_Module__r.Date__c), CALENDAR_YEAR(Observation__r.Training_Session__r.Training_Module__r.Date__c)
                ORDER BY CALENDAR_YEAR(Observation__r.Training_Session__r.Training_Module__r.Date__c), CALENDAR_MONTH(Observation__r.Training_Session__r.Training_Module__r.Date__c)
              `);

        // Query to find data collected by the FT monthly
        const ftQuery = `
                SELECT Trainer__c,
                       CALENDAR_MONTH(Training_Module__r.Date__c) month,
                       CALENDAR_YEAR(Training_Module__r.Date__c) year,
                       AVG(Number_in_Attendance__c) avg_attendance_by_ft
                FROM Training_Session__c
                WHERE Trainer__c IN (${ftIds}) AND Date__c != null
                GROUP BY Trainer__c, CALENDAR_MONTH(Training_Module__r.Date__c), CALENDAR_YEAR(Training_Module__r.Date__c)
              `;

        const ftAttendanceQueryResult = await sf_conn.query(ftQuery);
        const ftAttendanceData = ftAttendanceQueryResult.records;

        // Query to find data collected by AA (Assessment Agency) for the FT per month
        const aaQuery = `
                SELECT Trainer__c,
                       CALENDAR_MONTH(Training_Session__r.Training_Module__r.Date__c) month,
                       CALENDAR_YEAR(Training_Session__r.Training_Module__r.Date__c) year,
                       AVG(Number_of_Participants__c) avg_attendance_by_aa
                FROM Observation__c
                WHERE Trainer__c IN (${ftIds}) AND RecordType.Name = 'Training' AND Training_Session__r.Training_Module__r.Date__c != null
                GROUP BY Trainer__c, CALENDAR_MONTH(Training_Session__r.Training_Module__r.Date__c), CALENDAR_YEAR(Training_Session__r.Training_Module__r.Date__c)
              `;

        const aaAttendanceQueryResult = await sf_conn.query(aaQuery);
        const aaAttendanceData = aaAttendanceQueryResult.records;

        // Calculate monthly attendance difference
        const monthlyAttendanceDifference = ftAttendanceData.map((ftData) => {
          const correspondingAaData = aaAttendanceData.find(
            (aaData) =>
              aaData.month === ftData.month &&
              aaData.year === ftData.year &&
              aaData.Trainer__c === ftData.Trainer__c
          );
        
          const ftAttendance = ftData.avg_attendance_by_ft
            ? parseInt(ftData.avg_attendance_by_ft)
            : 0;
        
          const aaAttendance = correspondingAaData && correspondingAaData.avg_attendance_by_aa
            ? parseInt(correspondingAaData.avg_attendance_by_aa)
            : 0;
        
          const difference = aaAttendance - ftAttendance;
        
          return {
            trainerId: ftData.Trainer__c,
            month: getMonthAbbreviation(ftData.month),
            year: ftData.year,
            difference: isNaN(difference) ? 0 : difference,  // Ensure difference is valid
            ftAttendance: isNaN(ftAttendance) ? 0 : ftAttendance,  // Ensure valid number
            aaAttendance: isNaN(aaAttendance) ? 0 : aaAttendance,  // Ensure valid number
          };
        });
        

        // Organize data by staff ID for trained FFGs
        const staffTrainedFFGsMap = {};
        for (const record of trainedFFGsQueryResult.records) {
          const trainerId = record.Trainer__c;
          if (!staffTrainedFFGsMap[trainerId]) {
            staffTrainedFFGsMap[trainerId] = [];
          }
          staffTrainedFFGsMap[trainerId].push({
            month: record.month,
            year: record.year,
            totalTrainedFFGs: record.totalTrainedFFGs,
          });
        }

        // Organize data by staff ID for visited farms
        const staffVisitedFarmsMap = {};
        for (const record of visitedFarmsQueryResult.records) {
          const trainerId = record.Farmer_Trainer__c;
          if (!staffVisitedFarmsMap[trainerId]) {
            staffVisitedFarmsMap[trainerId] = [];
          }
          staffVisitedFarmsMap[trainerId].push({
            month: getMonthAbbreviation(record.month),
            year: record.year,
            totalVisitedFarms: record.totalVisitedFarms,
          });
        }

        // Organize data by staff ID for monthly rating
        const staffMonthlyRatingMap = {};
        for (const record of monthlyRatingQueryResult.records) {
          const trainerId = record.Trainer__c;
          if (!staffMonthlyRatingMap[trainerId]) {
            staffMonthlyRatingMap[trainerId] = [];
          }
          staffMonthlyRatingMap[trainerId].push({
            month: getMonthAbbreviation(record.Month),
            year: record.Year,
            avgScore:
              record.Avg_Score != null
                ? parseFloat(record.Avg_Score.toFixed(1))
                : 0,
          });
        }

        // Calculate monthly performance for each FT
        const ftData = fts.map((ft) => {
          const trainerId = ft.Responsible_Staff__c;
          const monthlyTrainedFFGs = staffTrainedFFGsMap[trainerId] || [];
          const monthlyVisitedFarms = staffVisitedFarmsMap[trainerId] || [];
          const monthlyRating = staffMonthlyRatingMap[trainerId] || [];
          const monthlyAttendanceDiff = monthlyAttendanceDifference.filter(
            (data) => data.trainerId === trainerId
          );

          const totalFFGs = ft.totalFFGs;

          const monthlyPerformance = monthlyTrainedFFGs.map((trainedFFGs) => {
            const percentage = (trainedFFGs.totalTrainedFFGs / totalFFGs) * 100;
            return {
              month: getMonthAbbreviation(trainedFFGs.month),
              year: trainedFFGs.year,
              percentage: percentage.toFixed(2),
            };
          });

          return {
            id: ft.Responsible_Staff__c,
            staffId: ft.Responsible_Staff__c,
            name: ft.Name,
            monthlyPerformance: monthlyPerformance,
            monthlyVisitedFarms: monthlyVisitedFarms,
            monthlyRating: monthlyRating,
            monthlyAttDifference: monthlyAttendanceDiff,
          };
        });

        return {
          message: "success",
          status: 200,
          data: ftData,
        };
      } catch (error) {
        console.log(error);
        return {
          message: error.message,
          status: error.status,
          data: null,
        };
      }
    },
  },

  Mutation: {},
};

// Utility function to get the abbreviation of a month based on its number
function getMonthAbbreviation(monthNumber) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return months[monthNumber - 1]; // Subtract 1 because month numbers are zero-based
}

export default PerformanceResolvers;
