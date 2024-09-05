"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("tbl_best_practices", "question", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn("tbl_best_practices", "answer", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });

    // Add any other fields or constraints as needed
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("tbl_best_practices", "question");
    await queryInterface.removeColumn("tbl_best_practices", "answer");
    // Rollback any other column changes made above
  },
};
