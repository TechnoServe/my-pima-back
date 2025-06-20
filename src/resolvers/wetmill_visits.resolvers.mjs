// graphql/resolvers/visits.resolvers.mjs
import WetmillVisit from "../models/wetmill_visits.model.mjs";
import Wetmills from "../models/wetmills.model.mjs";

const WetMillVisitsResolvers = {
  Query: {
    getVisits: async (_, { program }) => {
      try {
        // fetch raw visits
        const visitsRaw = await WetmillVisit.findAll({
          include: [{
            model: Wetmills,
            as: "wetmill",
            attributes: ["id", "wet_mill_unique_id", "name"],
            // required: true, 
            where: {
              programme: program,
            },
          }],
          order: [["visit_date", "DESC"]],
        });

        // map to GraphQL Visit type
        const visits = visitsRaw.map((v) => ({
          id: v.id,
          visited_at: v.visit_date.toISOString(),
          wetmillId: v.wetmill_id,
        }));

        return {
          message: "Visits fetched successfully",
          status: 200,
          visits,
        };
      } catch (err) {
        console.error("Error fetching visits:", err);
        return {
          message: err.message || "Internal server error",
          status: 500,
          visits: [],
        };
      }
    },
  },
};

export default WetMillVisitsResolvers;
