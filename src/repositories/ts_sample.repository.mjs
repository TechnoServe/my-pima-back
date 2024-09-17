import TsSample from "../models/ts_sample.model.mjs";

export const TsSampleRepository = {
  async bulkCreate(records, options = {}) {
    return await TsSample.bulkCreate(records, options);
  },

  async count(where) {
    return await TsSample.count({ where });
  },

  async findAll(where) {
    return TsSample.findAll({ where });
  },
};
