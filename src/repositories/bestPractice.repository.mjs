import BestPractice from "../models/best_practice.model.mjs";
import FarmVisit from "../models/farm_visit.model.mjs";

export const BestPracticeRepository = {
  async create(data) {
    return await BestPractice.create(data);
  },

  async findById(practiceId) {
    return await BestPractice.findByPk(practiceId);
  },

  async checkAllReviewed(visitId) {
    const practices = await BestPractice.findAll({
      where: { visit_id: visitId },
    });

    return practices.every(practice => practice.correct_answer !== null);
  },

  async findByVisit(visitId) {
    return await BestPractice.findAll({
      where: { visit_id: visitId },
      include: [
        {
          model: FarmVisit,
          as: "FarmVisit",  // Use the correct alias here
        },
      ],
    });
  },

  async update(practiceId, data) {
    return await BestPractice.update(data, {
      where: { practice_id: practiceId },
    });
  },

  async bulkCreate(records, options = {}) {
    return await BestPractice.bulkCreate(records, options);
  },

  async count(where) {
    return await BestPractice.count({ where });
  },

  // New method to count practices based on FarmVisit's data, including project and date filtering
  async countWithFarmVisit(where, farmVisitWhere) {
    return await BestPractice.count({
      where,
      include: [
        {
          model: FarmVisit,
          as: "FarmVisit",  // Use the correct alias here
          where: farmVisitWhere,
        },
      ],
    });
  },

  // New method to find all BestPractice records with related FarmVisit data
  async findAllWithFarmVisit(where, farmVisitWhere) {
    return await BestPractice.findAll({
      where,
      include: [
        {
          model: FarmVisit,
          as: "FarmVisit",  // Use the correct alias here
          where: farmVisitWhere,
        },
      ],
    });
  },
};
