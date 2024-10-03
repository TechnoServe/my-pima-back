'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('tbl_ts_samples', 'ts_latitude', {
      type: Sequelize.DECIMAL(10, 8),
      allowNull: true,
    });
    await queryInterface.addColumn('tbl_ts_samples', 'ts_longitude', {
      type: Sequelize.DECIMAL(11, 8),
      allowNull: true,
    });
    await queryInterface.addColumn('tbl_ts_samples', 'tg_latitude', {
      type: Sequelize.DECIMAL(10, 8),
      allowNull: true,
    });
    await queryInterface.addColumn('tbl_ts_samples', 'tg_longitude', {
      type: Sequelize.DECIMAL(11, 8),
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('tbl_ts_samples', 'ts_latitude');
    await queryInterface.removeColumn('tbl_ts_samples', 'ts_longitude');
    await queryInterface.removeColumn('tbl_ts_samples', 'tg_latitude');
    await queryInterface.removeColumn('tbl_ts_samples', 'tg_longitude');
  }
};
