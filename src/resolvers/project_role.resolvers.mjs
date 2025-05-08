import ProjectRole from "../models/project_role.model.mjs";
import Projects from "../models/projects.models.mjs";
import Roles from "../models/roles.model.mjs";
import Users from "../models/users.model.mjs";

const ProjectRoleResolvers = {
  Query: {
    loadProjectRoles: async (_, __, { sf_conn }) => {
      try {
        // create soql query
        const query = `SELECT Id, Project__c, Role__c, Staff__c FROM Project_Role__c`;

        let allRecords = [];
        let result = await sf_conn.query(query);

        allRecords = allRecords.concat(result.records);

        while (!result.done) {
          result = await sf_conn.queryMore(result.nextRecordsUrl);
          allRecords = allRecords.concat(result.records);
        }

        // for every record, check if Project__c or Staff__C exists in Projects or Users table respectively
        // if it doesn't exist, skip it
        // if it exists, create a new ProjectRole record with the project_id and user_id
        for (let i = 0; i < allRecords.length; i++) {
          // console.log(i, res.records.length);
          const record = allRecords[i];

          const project = await Projects.findOne({
            where: {
              sf_project_id: record.Project__c,
            },
          });

          const user = await Users.findOne({
            where: {
              sf_user_id: record.Staff__c,
            },
          });

          if (record.Staff__c === '003Oj00000TT1Y1IAL') {
            console.log('found record with Staff__c = 003Oj00000TT1Y1IAL');
          }

          if (!project || !user) {
            continue;
          }

          // if record already exists, skip it
          const projectRoleExists = await ProjectRole.findOne({
            where: {
              project_id: project.project_id,
              user_id: user.user_id,
            },
          });

          if (projectRoleExists) {
            continue;
          }

          let role = "standard";

          if (record.Role__c === "Business Advisor") {
            role = "business_advisor";
          } else if (record.Role__c === "Project Manager") {
            role = "project_manager";
          } else if (record.Role__c === "Senior Business Advisor") {
            role = "senior_business_advisor";
          } else if (record.Role__c === "Farmer Trainer") {
            role = "farmer_trainer";
          } else if (record.Role__c === "Business Councelor") {
            role = "business_councelor";
          }

          // get role_id from role
          const roleRes = await Roles.findOne({
            where: {
              role_name: role,
            },
          });

          await ProjectRole.create({
            project_id: project.project_id,
            user_id: user.user_id,
            role: roleRes.role_id,
          });
        }

        return {
          message: "Project Roles loaded successfully",
          status: 200,
          total_loaded: allRecords.length,
        };
      } catch (err) {
        console.log(err);

        return {
          message: err.message,
          status: err.status,
        };
      }
    },

    getProjectRoles: async (_, __, { }) => {
      try {
        const res = await ProjectRole.findAll({
          include: [
            {
              model: Users,
              as: "tbl_user",
            },
            {
              model: Projects,
              as: "tbl_project",
            },
            {
              model: Roles,
              as: "tbl_role",
            },
          ],
        });

        // map tbl_roles as role, tbl_users as user, tbl_projects as project
        res.map((project_role) => {
          project_role.role = project_role.tbl_role;
          project_role.user = project_role.tbl_user;
          project_role.project = project_role.tbl_project;

          return project_role;
        });

        return {
          message: "Project Role fetched successfully",
          status: 200,
          project_role: res,
        };
      } catch (err) {
        console.error(err);

        return {
          message: err.message,
          status: 500,
        };
      }
    },

    getProjectRoleById: async (_, { pr_id }, { }) => {
      try {
        const res = await ProjectRole.findByPk(pr_id);

        if (!res) {
          return {
            message: "Project Role not found",
            status: 404,
          };
        }

        return {
          message: "Project Role fetched successfully",
          status: 200,
          project_role: res,
        };
      } catch (err) {
        console.error(err);

        return {
          message: err.message,
          status: 500,
        };
      }
    },

    getProjectRolesByUserId: async (_, { user_id }, { }) => {
      try {
        const res = await ProjectRole.findAll({
          where: {
            user_id,
          },
        });

        if (!res) {
          return {
            message: "Project Role not found",
            status: 404,
          };
        }

        return {
          message: "Project Role fetched successfully",
          status: 200,
          project_role: res,
        };
      } catch (err) {
        console.error(err);

        return {
          message: err.message,
          status: 500,
        };
      }
    },

    getProjectRolesByProjectId: async (_, { project_id }, { }) => {
      try {
        const res = await ProjectRole.findAll({
          where: {
            project_id,
          },
          include: [
            {
              model: Users,
              as: "tbl_user",
            },
            {
              model: Projects,
              as: "tbl_project",
            },
            {
              model: Roles,
              as: "tbl_role",
            },
          ],
        });

        if (!res) {
          return {
            message: "Project Role not found",
            status: 404,
          };
        }

        // map tbl_roles as role, tbl_users as user, tbl_projects as project
        res.map((project_role) => {
          project_role.role = project_role.tbl_role;
          project_role.user = project_role.tbl_user;
          project_role.project = project_role.tbl_project;

          return project_role;
        });

        return {
          message: "Project Role fetched successfully",
          status: 200,
          project_role: res,
        };
      } catch (err) {
        console.error(err);

        return {
          message: err.message,
          status: 500,
        };
      }
    },
  },

  Mutation: {
    addProjectRole: async (_, { user_id, project_id, role_id }, { }) => {
      try {
        // Check if user exists
        const user = await Users.findByPk(user_id);
        const project = await Projects.findByPk(project_id);
        const role = await Roles.findByPk(role_id);

        if (!user) {
          return {
            message: "User not found",
            status: 404,
          };
        }

        if (!project) {
          return {
            message: "Project not found",
            status: 404,
          };
        }

        if (!role) {
          return {
            message: "Role not found",
            status: 404,
          };
        }

        // Check if project_role already exists
        const project_role = await ProjectRole.findOne({
          where: {
            user_id,
            project_id,
          },
        });

        if (project_role) {
          return {
            message: "Project Role already exists",
            status: 400,
          };
        }

        const res = await ProjectRole.create({
          user_id,
          project_id,
          role: role_id || role.find((r) => r.role_name === "standard").role_id,
        });

        return {
          message: "Project Role added successfully",
          status: 200,
          project_role: res,
        };
      } catch (err) {
        console.error(err);

        return {
          message: err.message,
          status: 500,
        };
      }
    },

    updateProjectRole: async (
      _,
      { pr_id, user_id, project_id, role_id },
      { }
    ) => {
      // Check if project_role exists
      const project_role = await ProjectRole.findByPk(pr_id);

      if (!project_role) {
        return {
          message: "Project Role not found",
          status: 404,
        };
      }

      // Check if user exists
      const user = await Users.findByPk(user_id);
      const project = await Projects.findByPk(project_id);
      const role = await Roles.findByPk(role_id);

      if (!user) {
        return {
          message: "User not found",
          status: 404,
        };
      }

      if (!project) {
        return {
          message: "Project not found",
          status: 404,
        };
      }

      if (!role) {
        return {
          message: "Role not found",
          status: 404,
        };
      }

      // check if user and project combination already exists
      const projectRoleExists = await ProjectRole.findOne({
        where: {
          user_id,
          project_id,
        },
      });

      if (!projectRoleExists) {
        return {
          message: "Project Role does not exists",
          status: 400,
        };
      }

      try {
        const res = await ProjectRole.update(
          {
            user_id,
            role_id,
          },
          {
            where: {
              project_id,
            },
          }
        );

        return {
          message: "Project Role updated successfully",
          status: 200,
          project_role: res,
        };
      } catch (err) {
        console.error(err);

        return {
          message: err.message,
          status: 500,
        };
      }
    },

    deleteProjectRole: async (_, { pr_id }, { }) => {
      try {
        // Check if projectRole exists
        const projectRole = await ProjectRole.findByPk(pr_id);

        if (!projectRole) {
          return {
            message: "Project Role not found",
            status: 404,
          };
        }

        const res = await ProjectRole.destroy({
          where: {
            pr_id,
          },
        });

        return {
          message: "Project Role deleted successfully",
          status: 200,
          project_role: res,
        };
      } catch (err) {
        console.error(err);

        return {
          message: err.message,
          status: 500,
        };
      }
    },

    assignUsersToAllProjects: async (_, { user_ids, role_id }, { }) => {
      try {
        // Validate role
        const role = await Roles.findByPk(role_id);
        if (!role) {
          return {
            message: "Role not found",
            status: 404,
          };
        }

        // Get users by ID
        const users = await Users.findAll({
          where: {
            user_id: user_ids,
          },
        });

        console.log(users);

        const foundUserIds = users.map((user) => user.user_id);
        const missingUserIds = user_ids.filter(
          (id) => !foundUserIds.includes(id)
        );

        // Fetch all projects
        const projects = await Projects.findAll();

        const result = {
          created: [],
          skipped: [],
          missingUsers: missingUserIds,
        };

        // Assign role to each user in all projects
        for (const user of users) {
          for (const project of projects) {
            const existing = await ProjectRole.findOne({
              where: {
                user_id: user.user_id,
                project_id: project.project_id,
              },
            });

            if (existing) {
              result.skipped.push({
                user_id: user.user_id,
                project_id: project.project_id,
                reason: "Already has a role in this project",
              });
              continue;
            }

            const newRole = await ProjectRole.create({
              user_id: user.user_id,
              project_id: project.project_id,
              role: role_id,
            });

            result.created.push({
              user_id: user.user_id,
              project_id: project.project_id,
              role_id,
            });
          }
        }

        return {
          message: "Users successfully assigned to all projects",
          status: 200,
          result,
        };
      } catch (err) {
        console.error(err);
        return {
          message: err.message,
          status: 500,
        };
      }
    },
  },
};

export default ProjectRoleResolvers;
