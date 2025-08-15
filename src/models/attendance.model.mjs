// models/attendance.model.mjs

import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";

const Attendance = sequelize.define(
  "Attendance",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    salesforceId: {
      field: "salesforce_id",
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    projectId: {
      field: "project_id",
      type: DataTypes.STRING,
    },
    name: DataTypes.STRING,
    participantId: {
      field: "participant_id",
      type: DataTypes.STRING,
    },
    participantGender: {
      field: "participant_gender",
      type: DataTypes.STRING,
    },
    attended: DataTypes.BOOLEAN,
    trainingSessionId: {
      field: "training_session_id",
      type: DataTypes.STRING,
    },
    date: DataTypes.DATE,
    moduleName: {
      field: "module_name",
      type: DataTypes.STRING,
    },
    moduleNumber: {
      field: "module_number",
      type: DataTypes.INTEGER,
    },
    moduleId: {
      field: "module_id",
      type: DataTypes.STRING,
    },
    sendToSalesforce: {
      field: "send_to_salesforce",
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "attendance",
    underscored: true,
  }
);

// Mark any local update for push back to Salesforce
Attendance.beforeUpdate((att) => {
  att.sendToSalesforce = true;
});

export default Attendance;
