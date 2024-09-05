'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('tbl_farm_visits', {
      visit_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      sf_visit_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      farmer_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      farmer_pima_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      farmer_tns_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      date_visited: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      farmer_trainer: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      overall_status: {
        type: Sequelize.ENUM("Reviewed", "Not Reviewed"),
        allowNull: false,
        defaultValue: "Not Reviewed",
      },
      last_reviewed_by: {
        type: Sequelize.UUID,
        references: {
          model: 'tbl_users',
          key: 'user_id',
        },
      },
      date_sampled: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('tbl_farm_visits');
  }
};
