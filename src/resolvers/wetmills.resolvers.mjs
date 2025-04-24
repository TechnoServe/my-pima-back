import ExcelJS from "exceljs";
import Wetmills from "../models/wetmills.model.mjs";
import SurveyResponse from "../models/survey_response.model.mjs";
import SurveyQuestionResponse from "../models/survey_question_response.model.mjs";

const ALLOWED_SURVEYS = [
  "cpqi",
  "employees",
  "financials",
  "infrastructure",
  "kpis",
  "manager_needs_assessment",
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
        // Fetch all responses of this type, including their question_responses
        const responses = await SurveyResponse.findAll({
          where: { survey_type: surveyType },
          include: [{ model: SurveyQuestionResponse, as: "question_responses" }],
        });

        // Gather all distinct question names to form columns
        const questionNames = new Set();
        responses.forEach((r) =>
          r.question_responses.forEach((q) => questionNames.add(q.question_name))
        );

        // Create worksheet named after the survey
        const sheet = workbook.addWorksheet(surveyType);

        // Define columns: static fields + one column per question
        const columns = [
          { header: "Survey ID",         key: "id",              width: 36 },
          { header: "Visit ID",          key: "form_visit_id",   width: 36 },
          { header: "Completed Date",    key: "completed_date",  width: 24 },
          { header: "General Feedback",  key: "general_feedback",width: 40 },
          // Spread in question columns
          ...[...questionNames].map((qn) => ({ header: qn, key: qn, width: 20 })),
        ];
        sheet.columns = columns;

        // Populate rows
        for (const r of responses) {
          // Base row data
          const row = {
            id:             r.id,
            form_visit_id:  r.form_visit_id,
            completed_date: r.completed_date
              ? r.completed_date.toISOString()
              : "",
            general_feedback: r.general_feedback || "",
          };

          // Add each question’s value to the row
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
