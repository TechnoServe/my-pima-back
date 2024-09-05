'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    await queryInterface.addColumn('tbl_projects', 'project_country', {
      type: Sequelize.STRING,
      allowNull: true,
    });


    // Add any other fields or constraints as needed
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('tbl_projects', 'project_country');
    // Rollback any other column changes made above
  }
};
