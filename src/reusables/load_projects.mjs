import Projects from "../models/projects.models.mjs";

const loadSFProjects = async (conn) => {
  let records = [],
    total_new_projects = 0;
  try {
    records = await conn.query(
      "SELECT Id, Name, Project_Status__c, Project_Country__c, Project_Country__r.Name FROM Project__c WHERE Project_Status__c = 'Active'"
    );

    console.log(records.records.slice(0, 4))

    const promises = records.records.map(async (record) => {
      console.log(record)
      const project = await Projects.findOne({
        where: { sf_project_id: record.Id },
      });
      if (!project && record.Project_Status__c != "Inactive") {
        total_new_projects += 1;
        await Projects.create({
          sf_project_id: record.Id,
          project_name: record.Name,
          project_country: record.Project_Country__c ? record.Project_Country__r.Name : '',
        });
      } else {
        await Projects.update(
          {
            project_name: record.Name,
            status:
              record.Project_Status__c === "Active" ? "active" : "inactive",
            project_country: record.Project_Country__c ? record.Project_Country__r.Name : '',
          },
          {
            where: { sf_project_id: record.Id },
          }
        );
      }
    });

    await Promise.all(promises);

    return {
      message: "Projects loaded successfully",
      status: 200,
      total_new_projects,
    };
  } catch (err) {
    console.error(err);

    return {
      message: err.message,
      status: err.status,
    };
  }
};

export default loadSFProjects;
