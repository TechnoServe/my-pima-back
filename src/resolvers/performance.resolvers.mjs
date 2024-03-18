const PerformanceResolvers = {
  Query: {
    getPerformanceByAA: async (_, { project_id }, { sf_conn }) => {
      try {
        // Query AAs for this project
        const aasResult = await sf_conn.query(
          `SELECT Id, Staff__c, Staff__r.Name
          FROM Project_Role__c
          WHERE Project__c = '${project_id}' AND Role__c = 'Business Advisor'
        `);

        const aas = aasResult.records;

        // Collect all Staff__c IDs
        const staffIds = aas.map(aa => aa.Staff__c);

        // Query observations for all AAs with observation counts
        const observationsResult = await sf_conn.query(
          `SELECT Trainer__r.ReportsToId,
                  COUNT(CASE WHEN RecordType.Name = 'Training' THEN 1 END) AS TrainingCount,
                  COUNT(CASE WHEN RecordType.Name = 'Demo Plot' THEN 1 END) AS DemoPlotCount
          FROM Observation__c
          WHERE Training_Group__r.Project__c = '${project_id}' AND Trainer__c IN ('${staffIds.join("','")}')
          GROUP BY Trainer__r.ReportsToId
        `);

        const observationsByTrainerId = {};
        observationsResult.records.forEach(observation => {
          observationsByTrainerId[observation.Trainer__r.ReportsToId] = {
            TrainingCount: observation.TrainingCount,
            DemoPlotCount: observation.DemoPlotCount
          };
        });

        // Add observation counts to corresponding AAs
        aas.forEach(aa => {
          const observationCounts = observationsByTrainerId[aa.Staff__c] || {};
          aa.TrainingCount = observationCounts.TrainingCount || 0;
          aa.DemoPlotCount = observationCounts.DemoPlotCount || 0;
        });

        return aas;
      } catch (error) {
        console.log(error);

        return {
          message: error.message,
          status: error.status,
        };
      }
    },
  },

  Mutation: {},
};

export default PerformanceResolvers;
