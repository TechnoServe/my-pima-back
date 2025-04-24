// graphql/resolvers/visits.resolvers.mjs
import WetmillVisit from "../models/wetmill_visits.model.mjs";

const WetMillVisitsResolvers = {
  Query: {
    getVisits: async () => {
      try {
        // fetch raw visits
        const visitsRaw = await WetmillVisit.findAll({
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
