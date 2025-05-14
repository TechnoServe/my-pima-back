// src/resolvers/wetmills.resolvers.mjs

import ExcelJS from "exceljs";
import Wetmills from "../models/wetmills.model.mjs";
import SurveyResponse from "../models/survey_response.model.mjs";
import SurveyQuestionResponse from "../models/survey_question_response.model.mjs";
import WetmillVisit from "../models/wetmill_visits.model.mjs";
import Users from "../models/users.model.mjs";

const ALLOWED_SURVEYS = [
  "manager_needs_assessment",
  "cpqi",
  "employees",
  "financials",
  "infrastructure",
  "kpis",
  "wet_mill_training",
  "waste_water_management",
  "water_and_energy_use",
];

const WetmillsResolvers = {
  Query: {
    getWetmills: async () => {
      try {
        const wetmills = await Wetmills.findAll({
          order: [["created_at", "DESC"]],
        });

        return {
          message: "Wetmills fetched successfully",
          status: 200,
          wetmills,
        };
      } catch (err) {
        console.error("Error fetching wetmills:", err);
        return {
          message: err.message || "Internal server error",
          status: 500,
          wetmills: [],
        };
      }
    },

    exportWetMillsDataExcel: async () => {
      // 1. Create a new workbook
      const workbook = new ExcelJS.Workbook();

      // 2. For each survey type, fetch responses and build a sheet
      for (const surveyType of ALLOWED_SURVEYS) {
        const responses = await SurveyResponse.findAll({
          where: { survey_type: surveyType },
          include: [
            { model: SurveyQuestionResponse, as: "question_responses" },
            {
              model: WetmillVisit,
              attributes: ["visit_date"],
              as: "wetmill_visit",
              include: [
                { model: Wetmills, as: "wetmill", attributes: ["name"] },
                { model: Users, as: "user", attributes: ["user_name"] },
              ],
            },
          ],
        });

        // Gather all distinct question names to form columns
        const questionNames = new Set();
        responses.forEach((r) =>
          r.question_responses.forEach((q) =>
            questionNames.add(q.question_name)
          )
        );

        // Create worksheet named after the survey
        const sheet = workbook.addWorksheet(surveyType);

        // Define columns: new static fields + existing + per-question columns
        sheet.columns = [
          { header: "Wetmill Name",     key: "wetmill_name",     width: 30 },
          // { header: "Form Name",        key: "form_name",        width: 20 },
          { header: "Visit Date",       key: "visit_date",       width: 24 },
          { header: "Submitted By",     key: "submitted_by",     width: 25 },
          // { header: "Survey ID",        key: "id",               width: 36 },
          // { header: "Visit ID",         key: "form_visit_id",    width: 36 },
          { header: "Completed Date",   key: "completed_date",   width: 24 },
          { header: "General Feedback", key: "general_feedback", width: 40 },
          ...[...questionNames].map((qn) => ({
            header: qn,
            key: qn,
            width: 20,
          })),
        ];

        // Populate rows
        for (const r of responses) {
          console.log("Processing response:", r);
          const visit = r.wetmill_visit || {};
          const row = {
            wetmill_name:     visit.wetmill?.name || "",
            form_name:        surveyType,
            visit_date:       visit.visit_date
                                 ? visit.visit_date.toISOString()
                                 : "",
            submitted_by:     visit.user?.username || "",
            survey_type:      r.survey_type,
            id:               r.id,
            form_visit_id:    r.form_visit_id,
            completed_date:   r.completed_date
                                 ? r.completed_date.toISOString()
                                 : "",
            general_feedback: r.general_feedback || "",
          };

          r.question_responses.forEach((q) => {
            let val = null;
            if (q.value_text    != null) val = q.value_text;
            if (q.value_number  != null) val = q.value_number;
            if (q.value_boolean != null) val = q.value_boolean;
            if (q.value_date    != null)
              val = new Date(q.value_date).toISOString();
            if (q.value_gps     != null)
              val = JSON.stringify(q.value_gps);

            row[q.question_name] = val;
          });

          sheet.addRow(row);
        }
      }

      // 3. Write workbook to a buffer and encode as Base64
      const buffer = await workbook.xlsx.writeBuffer();
      const contentBase64 = buffer.toString("base64");

      // 4. Return filename + Base64 content
      return {
        filename: "survey_data.xlsx",
        contentBase64,
      };
    },
  },
};

export default WetmillsResolvers;
