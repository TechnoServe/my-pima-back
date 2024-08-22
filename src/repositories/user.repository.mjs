import Users from '../models/users.model.mjs';

export const UserRepository = {
  async findById(userId) {
    return await Users.findByPk(userId);
  },

  async create(data) {
    return await Users.create(data);
  }
};
