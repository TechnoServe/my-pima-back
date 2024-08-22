import BestPractice from '../models/best_practice.model.mjs';

export const BestPracticeRepository = {
  async create(data) {
    return await BestPractice.create(data);
  },

  async findByVisit(visitId) {
    return await BestPractice.findAll({
      where: { visit_id: visitId },
      include: ['BestPracticeResults'],
    });
  },

  async update(practiceId, data) {
    return await BestPractice.update(data, { where: { practice_id: practiceId } });
  }
};
