"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(
      "tbl_best_practice_results",
      "method_result",
      {
        type: Sequelize.STRING,
        allowNull: true,
      }
    );

    await queryInterface.removeColumn("tbl_best_practice_results", "question");

    await queryInterface.removeColumn("tbl_best_practice_results", "answer");

    // Add any other fields or constraints as needed
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn(
      "tbl_best_practice_results",
      "method_result"
    );
    // Rollback any other column changes made above
  },
};
