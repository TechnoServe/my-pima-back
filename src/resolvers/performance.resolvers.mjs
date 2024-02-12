const PerformanceResolvers = {
  Query: {
    getFVQAsByFarmVisits: async (_, { project_id }, { sf_conn }) => {
      try {
        
      } catch (error) {
        console.log(error);

        return {
          message: error.message,
          status: error.status,
        };
      }
    },
  },

  Mutation: {
  },
};


export default PerformanceResolvers;
