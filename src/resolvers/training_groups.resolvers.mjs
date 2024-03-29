const TrainingGroupsResolvers = {
  Query: {
    trainingGroupsByProject: async (_, { project_id }, { sf_conn }) => {
      try {
        const res = await sf_conn.query(
          `SELECT Id, Name, TNS_Id__c, Active_Participants_Count__c, Responsible_Staff__r.Name, 
            Responsible_Staff__r.ReportsToId, Project__c, Group_Status__c, Active_Household_Count__c
             FROM Training_Group__c 
              WHERE Project__c = '${project_id}'`,
          async function (err, result) {
            if (err) {
              console.error(err);

              return {
                message: err.message,
                status: 500,
              };
            }

            // get total participants from Participant__c where Training_Group__c = result.records[0].Id
            // if (result.records.length > 0) {
            //   await sf_conn.query(
            //     `SELECT COUNT(Id) FROM Participant__c WHERE Training_Group__c = '${result.records[0].Id}'`,
            //     async function (err, result3) {
            //       if (err) {
            //         console.error(err);

            //         return {
            //           message: err.message,
            //           status: 500,
            //         };
            //       }

            //       result.records[0].Active_Participants_Count__c =
            //         result3.records[0].expr0;
            //     }
            //   );
            // }

            return result;
          }
        );

        // get distinct reportsToId from res
        const reportsToIds = [
          ...new Set(
            res.records.map((item) => item.Responsible_Staff__r.ReportsToId)
          ),
        ];

        // do a query to get the names of the reportsToIds from Contact
        const res2 = await sf_conn.query(
          `SELECT Id, Name FROM Contact WHERE Id IN ('${reportsToIds.join(
            "','"
          )}')`,
          async function (err, result) {
            if (err) {
              console.error(err);

              return {
                message: err.message,
                status: 500,
              };
            }

            return result;
          }
        );

        // const res3 = await sf_conn.query(
        //   `SELECT Training_Group__c, COUNT(Id) FROM Participant__c GROUP BY Training_Group__c`,
        //   async function (err, result) {
        //     if (err) {
        //       console.error(err);

        //       return {
        //         message: err.message,
        //         status: 500,
        //       };
        //     }

        //     return result;
        //   }
        // );

        return {
          message: "Training Groups fetched successfully",
          status: 200,
          trainingGroups:
            res.records.map(async (item) => {
              return {
                tg_id: item.Id,
                tg_name: item.Name,
                tns_id: item.TNS_Id__c,
                // total_participants:
                //   res3.records.find(
                //     (record) => record.Training_Group__c === item.Id
                //   ) === undefined
                //     ? 0
                //     : res3.records.find(
                //         (record) => record.Training_Group__c === item.Id
                //       ).expr0,
                total_households: item.Active_Household_Count__c,
                total_participants: item.Active_Participants_Count__c,
                farmer_trainer: item.Responsible_Staff__r.Name,
                business_advisor: item.Responsible_Staff__r.ReportsToId
                  ? res2.records.find(
                      (contact) =>
                        contact.Id === item.Responsible_Staff__r.ReportsToId
                    ).Name
                  : null,
                status: item.Group_Status__c,
              };
            }) || [],
        };
      } catch (err) {
        console.log(err);

        return {
          message: err.message,
          status: err.status,
        };
      }
    },
  },
};

export default TrainingGroupsResolvers;
