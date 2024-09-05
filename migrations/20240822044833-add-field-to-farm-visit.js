'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    await queryInterface.addColumn('tbl_farm_visits', 'sf_project_id', {
      type: Sequelize.STRING,
      allowNull: false,
    });


    // Add any other fields or constraints as needed
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('tbl_farm_visits', 'sf_project_id');
    // Rollback any other column changes made above
  }
};
