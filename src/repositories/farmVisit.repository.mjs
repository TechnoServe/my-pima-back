import BestPractice from "../models/best_practice.model.mjs";
import FarmVisit from "../models/farm_visit.model.mjs";

export const FarmVisitRepository = {
  // Find farm visits based on filters, with pagination and optional associations

  async findAllWithBestPractices(where1, where2, pageSize, page) {
    return await FarmVisit.findAll({
      where: where1, // This replaces the where conditions for FarmVisit
      include: [
        {
          model: BestPractice,
          as: "BestPractices",
          //where: where2, // This replaces the where conditions for BestPractice
          required: false,
          attributes: [
            "practice_id",
            "practice_name",
            "correct_answer",
            "question",
            "answer",
            "image_url",
          ],
        },
      ],
      // limit: pageSize,
      // offset: page * pageSize,
      order: [["date_visited", "ASC"]],
      logging: console.log,
    });
  },

  async findById(visitId) {
    return await FarmVisit.findByPk(visitId, {
      include: ["BestPractices", "User"],
    });
  },

  async findBySfId(sfVisitId) {
    return await FarmVisit.findOne({
      where: { sf_visit_id: sfVisitId },
      include: ["BestPractices", "User"],
    });
  },

  async findByProject(projectId, limit = 100) {
    return await FarmVisit.findAll({
      where: { project_id: projectId },
      limit,
      include: ["BestPractices", "User"],
    });
  },

  async create(data) {
    return await FarmVisit.create(data);
  },

  async update(visitId, data) {
    return await FarmVisit.update(data, { where: { visit_id: visitId } });
  },

  async bulkCreate(records, options = {}) {
    return await FarmVisit.bulkCreate(records, options);
  },

  async count(where) {
    return await FarmVisit.count({ where });
  },
};
