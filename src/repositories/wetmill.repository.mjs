import WetMillsRepository from "../models/wet_mills.model.mjs";

export const WetMillsRepository = {
  async bulkCreate(records, options = {}) {
    return await WetMillsRepository.bulkCreate(records, options);
  },

  async count(where) {
    return await WetMillsRepository.count({ where });
  },

  async findAll(where) {
    return WetMillsRepository.findAll({ where });
  },

  async update(values, where, options = {}) {
    return await WetMillsRepository.update(values, { where, ...options });
  },

  async bulkUpdate(updates, options = {}) {
    return await Promise.all(
      updates.map(({ values, where }) =>
        WetMillsRepository.update(values, { where, ...options })
      )
    );
  },
};
