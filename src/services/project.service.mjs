import Projects from "../models/projects.models.mjs";

export class ProjectService {
  async getProjectById(project_id) {
    const project = await Projects.findOne({
      where: { sf_project_id: project_id },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    return project;
  }
}
