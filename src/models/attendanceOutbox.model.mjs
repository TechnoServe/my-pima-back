// models/attendanceOutbox.model.mjs
import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";

const AttendanceOutbox = sequelize.define(
  "AttendanceOutbox",
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    projectId: { field: "project_id", type: DataTypes.STRING, allowNull: false },

    // Resolution hints
    participantSalesforceId: { field: "participant_salesforce_id", type: DataTypes.STRING, allowNull: true },
    participantTnsId: { field: "participant_tns_id", type: DataTypes.STRING, allowNull: false },
    ffgId: { field: "ffg_id", type: DataTypes.STRING, allowNull: false },
    moduleId: { field: "module_id", type: DataTypes.STRING, allowNull: false }, // Training_Module__c
    attended: { type: DataTypes.BOOLEAN, allowNull: false },

    uploadRunId: { field: "upload_run_id", type: DataTypes.UUID, allowNull: true },

    // Payload we eventually POST (Status__c, Participant__c, Training_Session__c …)
    payload: { type: DataTypes.JSONB, allowNull: false },

    status: { type: DataTypes.ENUM("pending", "pushing", "failed", "sent"), defaultValue: "pending" },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    lastError: { field: "last_error", type: DataTypes.TEXT, allowNull: true },
    nextAttemptAt: { field: "next_attempt_at", type: DataTypes.DATE, defaultValue: () => new Date() },
  },
  { tableName: "attendance_outbox", underscored: true, timestamps: true }
);

export default AttendanceOutbox;
