// models/participantOutbox.model.mjs
import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";

const ParticipantOutbox = sequelize.define(
  "ParticipantOutbox",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    participantId: {
      field: "participant_id",
      type: DataTypes.UUID,
      allowNull: false,
    },
    projectId: {
      field: "project_id",
      type: DataTypes.STRING,
      allowNull: false,
    },
    uploadRunId: { field: "upload_run_id", type: DataTypes.UUID, allowNull: true },
    // Payload that will be sent to Salesforce Participant__c (create/update)
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "pushing", "failed", "sent"),
      defaultValue: "pending",
    },
    attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    lastError: { field: "last_error", type: DataTypes.TEXT, allowNull: true },
    nextAttemptAt: {
      field: "next_attempt_at",
      type: DataTypes.DATE,
      defaultValue: () => new Date(),
    },
  },
  {
    tableName: "participant_outbox",
    underscored: true,
    timestamps: true, // Sequelize will create created_at/updated_at
  }
);

export default ParticipantOutbox;
