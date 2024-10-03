'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable("tbl_ts_samples", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      sf_project_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      sf_training_session_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      sf_training_module_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      training_module_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      tg_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      tg_tns_id: {
        type: Sequelize.STRING,
      },
      total_attendance: {
        type: Sequelize.DECIMAL
      },
      male_attendance: {
        type: Sequelize.DECIMAL,
      },
      female_attendance: {
        type: Sequelize.DECIMAL,
      },
      farmer_trainer_name: {
        type: Sequelize.STRING,
      }, 
      session_image_url: {
        type: Sequelize.STRING,
      },
      session_date: {
        type: Sequelize.DATE,
      },
      image_review_result: {
        type: Sequelize.ENUM("approved", "invalid", "unclear"),
        allowNull: true,
      },
      last_reviewed_by: {
        type: Sequelize.UUID,
        references: {
          model: 'tbl_users',
          key: 'user_id',
        },
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

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('tbl_ts_samples');
  }
};
