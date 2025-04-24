import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";

const SurveyQuestionResponse = sequelize.define(
  "survey_question_responses",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    survey_response_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "survey_responses",
        key: "id",
      },
    },
    section_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    question_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    field_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    value_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    value_number: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    value_boolean: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    value_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    value_gps: {
      type: DataTypes.GEOMETRY("POINT", 4326),
      allowNull: true,
    },
  },
  {
    tableName: "survey_question_responses",
    timestamps: false,
  }
);

export default SurveyQuestionResponse;
