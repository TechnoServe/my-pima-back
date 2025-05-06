// src/services/dashboard.service.mjs
import { Op } from "sequelize";
import SurveyQuestionResponse from "../models/survey_question_response.model.mjs";
import SurveyResponse from "../models/survey_response.model.mjs";
import WetmillVisit from "../models/wetmill_visits.model.mjs";

// The full list of documents every wetmill should have
const REQUIRED_DOCS = [
    "Registration license",
    "Tax number",
    "Production or operational license for current year",
    "Export license/number,",
];

export async function getMissingDocuments(wetmillId) {
    // 1) Fetch all 'documents' entries that have a non-null value_text
    //    i.e. the ones the BA said are available
    const rows = await SurveyQuestionResponse.findAll({
        attributes: ["value_text"],
        where: {
            question_name: "documents",
            value_text: { [Op.ne]: null },
        },
        include: [
            {
                model: SurveyResponse,
                as: "survey_response",
                attributes: [],
                where: { survey_type: "manager_needs_assessment" },
                include: [
                    {
                        model: WetmillVisit,
                        as: "wetmill_visit",
                        attributes: [],
                        where: { wetmill_id: wetmillId },
                    },
                ],
            },
        ],
    });

    console.log("Document Rows:", rows.map((r) => r.toJSON()));

    // 2) Extract the list of available docs
    const availableDocs = rows.map((r) => r.value_text);

    // 3) Compute which documents are missing
    const missingDocs = REQUIRED_DOCS.filter((doc) => !availableDocs.includes(doc));

    return missingDocs;
}

/**
 * Full list of all infra items the mill could report on.
 */
const INFRA_ITEMS = [
    "Constant, clean source of water",
    "Water circulation and/or treatment",
    "Water meter for measurement",
    "Floatation tank",
    "Cherry reception hopper",
    "Fermentation tanks",
    "Grading channels",
    "Pulp hopper",
    "General mills area clean and orderly",
    "Drying tables in a good state of repair",
    "Storage area clean",
    "Weighing scale is calibrated",
    "Pulp machine calibrated and oiled",
    "Moisture meter, thermometer, hygrometer",
    "Cherry purchasing receipts in stock",
    "Covering materials available",
];

/**
 * Fetches which infrastructure items are in good repair vs need repair
 * for a given wetmill.
 *
 * @param {string} wetmillId – UUID of the wetmill (visit.form_visit_id)
 */
export async function getInfrastructureChecklist(wetmillId) {
    // 1) Fetch all "good" entries
    const goodRows = await SurveyQuestionResponse.findAll({
        attributes: ["value_text"],
        where: {
            question_name: "are_the_following_in_good_state_of_repair",
            value_text: { [Op.ne]: null },
        },
        include: [
            {
                model: SurveyResponse,
                as: "survey_response",
                attributes: [],
                where: { survey_type: "infrastructure" },
                include: [
                    {
                        model: WetmillVisit,
                        as: "wetmill_visit",
                        attributes: [],
                        where: { wetmill_id: wetmillId },
                    },
                ],
            },
        ],
    });

    // 2) Fetch all "needs repair" entries
    const repairRows = await SurveyQuestionResponse.findAll({
        attributes: ["value_text"],
        where: {
            question_name: "which_of_the_following_needs_repair",
            value_text: { [Op.ne]: null },
        },
        include: [
            {
                model: SurveyResponse,
                as: "survey_response",
                attributes: [],
                where: { survey_type: "infrastructure" },
                include: [
                    {
                        model: WetmillVisit,
                        as: "wetmill_visit",
                        attributes: [],
                        where: { wetmill_id: wetmillId },
                    },
                ],
            },
        ],
    });

    const goodItems = goodRows.map((r) => r.value_text);
    const repairItems = repairRows.map((r) => r.value_text);

    return {
        items: INFRA_ITEMS,
        goodItems,
        repairItems,
    };
}

/**
 * Fetches the most recent Financial survey for this wetmill
 * and returns its key figures.
 */
export async function getFinancialBreakdown(wetmillId) {
  // 1) Find the latest Financial survey response for this mill
  const latestResp = await SurveyResponse.findOne({
    where: { survey_type: "financials" },
    include: [{
      model: WetmillVisit,
      as: "wetmill_visit",
      attributes: [],
      where: { wetmill_id: wetmillId },
    }],
    order: [["created_at", "DESC"]],
    attributes: ["id"],
  });
  if (!latestResp) {
    // No financial survey ever done
    return {
      totalProfit: 0,
      reserves: 0,
      socialActivities: 0,
      secondPaymentToFarmers: 0,
    };
  }

  // 2) Load the four numeric fields from that single response
  const rows = await SurveyQuestionResponse.findAll({
    attributes: ["question_name", "value_number"],
    where: {
      survey_response_id: latestResp.id,
      question_name: {
        [Op.in]: [
          "total_profit",
          "reserves",
          "social_activities",
          "second_payment_to_farmers",
        ],
      },
    },
  });

  // 3) Map them into our return shape
  const map = {};
  rows.forEach((r) => {
    map[r.question_name] = Number(r.value_number) || 0;
  });

  return {
    totalProfit: map.total_profit || 0,
    reserves: map.reserves || 0,
    socialActivities: map.social_activities || 0,
    secondPaymentToFarmers: map.second_payment_to_farmers || 0,
  };
}


/**
 * Returns the latest "employees" survey numbers for a wetmill.
 */
export async function getEmployeeStats(wetmillId) {
  // 1) find the latest SurveyResponse of type "employees" for this mill
  const latest = await SurveyResponse.findOne({
    where: { survey_type: "employees" },
    include: [{
      model: WetmillVisit,
      as: "wetmill_visit",
      attributes: [],
      where: { wetmill_id: wetmillId },
    }],
    order: [["created_at", "DESC"]],
    attributes: ["id"],
  });
  if (!latest) {
    return {
      menOwnership: 0, womenOwnership: 0,
      menFarmers: 0,  womenFarmers: 0,
      menPermanent: 0, womenPermanent: 0,
      menTemporary: 0, womenTemporary: 0,
      menDaily: 0,    womenDaily: 0,
    };
  }

  // 2) pull all relevant question responses
  const rows = await SurveyQuestionResponse.findAll({
    attributes: ["question_name","value_number"],
    where: {
      survey_response_id: latest.id,
      question_name: {
        [Op.in]: [
          "number_of_men_in_ownership",
          "number_of_women_in_ownership",
          "number_of_men_farm_members_of_the_coop",
          "number_of_women_farm_members_of_the_coop",
          "number_of_permanent_employees_men",
          "number_of_permanent_employees_women",
          "number_of_temporary_employees_at_peak_time_men",
          "number_of_temporary_employees_at_peak_time_women",
          "number_of_daily_workers_men",
          "number_of_daily_workers_women",
        ],
      },
    },
  });

  // 3) map into fields
  const m = {};
  rows.forEach(r => {
    m[r.question_name] = Number(r.value_number) || 0;
  });

  return {
    menOwnership:    m.number_of_men_in_ownership    || 0,
    womenOwnership:  m.number_of_women_in_ownership  || 0,
    menFarmers:      m.number_of_men_farm_members_of_the_coop   || 0,
    womenFarmers:    m.number_of_women_farm_members_of_the_coop || 0,
    menPermanent:    m.number_of_permanent_employees_men        || 0,
    womenPermanent:  m.number_of_permanent_employees_women      || 0,
    menTemporary:    m.number_of_temporary_employees_at_peak_time_men   || 0,
    womenTemporary:  m.number_of_temporary_employees_at_peak_time_women || 0,
    menDaily:        m.number_of_daily_workers_men              || 0,
    womenDaily:      m.number_of_daily_workers_women            || 0,
  };
}
