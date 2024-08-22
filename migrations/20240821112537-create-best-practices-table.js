'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('tbl_best_practices', {
      practice_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      sf_practice_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      visit_id: {
        type: Sequelize.UUID,
        references: {
          model: 'tbl_farm_visits',
          key: 'visit_id',
        },
        onDelete: 'CASCADE',
      },
      practice_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      correct_answer: {
        type: Sequelize.ENUM("yes", "no", "unclear"),
        allowNull: true,
        defaultValue: null, 
      },
      comments: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      image_url: {
        type: Sequelize.STRING,
        allowNull: true,
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
    await queryInterface.dropTable('tbl_best_practices');
  }
};
