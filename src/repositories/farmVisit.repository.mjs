import FarmVisit from '../models/farm_visit.model.mjs';

export const FarmVisitRepository = {
  async findById(visitId) {
    return await FarmVisit.findByPk(visitId, {
      include: ['BestPractices', 'User']
    });
  },

  async findBySfId(sfVisitId) {
    return await FarmVisit.findOne({
      where: { sf_visit_id: sfVisitId },
      include: ['BestPractices', 'User'],
    });
  },

  async findByProject(projectId, limit = 100) {
    return await FarmVisit.findAll({
      where: { project_id: projectId },
      limit,
      include: ['BestPractices', 'User'],
    });
  },

  async create(data) {
    return await FarmVisit.create(data);
  },

  async update(visitId, data) {
    return await FarmVisit.update(data, { where: { visit_id: visitId } });
  }
};
