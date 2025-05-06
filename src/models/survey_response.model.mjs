import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";
import SurveyQuestionResponse from "./survey_question_response.model.mjs";
import WetmillVisit from "./wetmill_visits.model.mjs";

const SurveyResponse = sequelize.define(
  "survey_responses",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    form_visit_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "wetmill_visits",
        key: "id",
      },
    },
    survey_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    completed_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    general_feedback: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "survey_responses",
    timestamps: false,
  }
);

SurveyResponse.hasMany(SurveyQuestionResponse, {
  foreignKey: "survey_response_id",
  as: "question_responses",
});

SurveyQuestionResponse.belongsTo(SurveyResponse, {
  foreignKey: "survey_response_id",
  as: "survey_response",
});

SurveyResponse.belongsTo(WetmillVisit, {
  foreignKey: "form_visit_id",
  as: "wetmill_visit",
});


export default SurveyResponse;
