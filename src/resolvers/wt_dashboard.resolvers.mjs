import { Op } from "sequelize";
import SurveyResponse from "../models/survey_response.model.mjs";
import SurveyQuestionResponse from "../models/survey_question_response.model.mjs";
import WetmillVisit from "../models/wetmill_visits.model.mjs";
import {
    getMissingDocuments,
    getInfrastructureChecklist,
    getFinancialBreakdown,
    getEmployeeStats,
    getCpqiStats,
    getCpqiChecklist,
    getTrainingAttendanceByTopic,
    getTrainingAttendanceOverall,
    getKpiStats,
    getParchmentDistribution,
} from "../services/dashboard.service.mjs";

const dashboardResolvers = {
    Query: {
        getOperationsRanking: async (_, { wetmillId }) => {
            // 1) find the latest manager_needs_assessment response for this wetmill
            const latestResp = await SurveyResponse.findOne({
                where: { survey_type: "manager_needs_assessment" },
                include: [
                    {
                        model: WetmillVisit,
                        as: "wetmill_visit",
                        attributes: [],
                        where: { wetmill_id: wetmillId },
                    },
                ],
                order: [["created_at", "DESC"]],
                attributes: ["id"],
            });
            if (!latestResp) return [];

            const responseId = latestResp.id;

            // 2) fetch all rank_N entries for that response
            const rankRows = await SurveyQuestionResponse.findAll({
                attributes: ["question_name", "value_text"],
                where: {
                    survey_response_id: responseId,
                    section_name: "operations",
                    question_name: {
                        [Op.and]: [
                            { [Op.like]: "rank\\_%" },
                            { [Op.notLike]: "%_reason" },
                        ],
                    },
                },
            });

            // 3) fetch all rank_N_reason entries for that same response
            const reasonRows = await SurveyQuestionResponse.findAll({
                attributes: ["question_name", "value_text"],
                where: {
                    survey_response_id: responseId,
                    section_name: "operations",
                    question_name: { [Op.like]: "rank\\_%_reason" },
                },
            });

            // 4) map reasons by rank number
            const reasonMap = {};
            reasonRows.forEach((r) => {
                const m = r.question_name.match(/^rank_(\d+)_reason$/);
                if (m) reasonMap[m[1]] = r.value_text;
            });

            // 5) combine into final array
            return rankRows.map((r) => {
                const m = r.question_name.match(/^rank_(\d+)$/);
                const rankNum = m ? parseInt(m[1], 10) : null;
                return {
                    rank: rankNum,
                    issue: r.value_text,
                    reason: reasonMap[rankNum] || null,
                };
            });
        },
        getMissingDocuments: async (_, { wetmillId }) => await getMissingDocuments(wetmillId),
        getInfrastructureChecklist: async (_, { wetmillId }) => await getInfrastructureChecklist(wetmillId),
        getFinancialBreakdown: async (_, { wetmillId }) => await getFinancialBreakdown(wetmillId),
        getEmployeeStats: async (_, { wetmillId }) => await getEmployeeStats(wetmillId),
        getCpqiStats: async (_, { wetmillId }) => await getCpqiStats(wetmillId),
        getCpqiChecklist: async (_, { wetmillId }) => await getCpqiChecklist(wetmillId),
        getTrainingAttendanceByTopic: async (_, { wetmillId }) => getTrainingAttendanceByTopic(wetmillId),
        getTrainingAttendanceOverall: async (_, { wetmillId }) => getTrainingAttendanceOverall(wetmillId),
        getKpiStats: async (_, { wetmillId }) => {
            try {
                const { cherry, total } = await getKpiStats(wetmillId);
                return { cherry, total };
            } catch (err) {
                throw new Error("Failed to fetch KPI stats");
            }
        },
        getParchmentDistribution: async (_, { wetmillId }) => {
            try {
                return await getParchmentDistribution(wetmillId);
            } catch (err) {
                throw new Error("Failed to fetch KPI stats");
            }
        },

    },
};

export default dashboardResolvers;
