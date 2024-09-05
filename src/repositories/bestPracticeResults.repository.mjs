import BestPracticeResults from '../models/best_practice_results.model.mjs';

export const BestPracticeResultsRepository = {
  async createMultiple(results) {
    return await BestPracticeResults.bulkCreate(results);
  }
};
