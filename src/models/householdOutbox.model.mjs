// models/householdOutbox.model.mjs
import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";

const HouseholdOutbox = sequelize.define(
  "HouseholdOutbox",
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    projectId: { field: "project_id", type: DataTypes.STRING, allowNull: false },

    // Optional existing Salesforce Id for update; null means create
    salesforceId: { field: "salesforce_id", type: DataTypes.STRING, allowNull: true },

    // Useful keys for resolution / dedupe
    ffgId: { field: "ffg_id", type: DataTypes.STRING, allowNull: false },
    householdNumber: { field: "household_number", type: DataTypes.INTEGER, allowNull: false },
    householdComposite: { field: "household_composite", type: DataTypes.STRING, allowNull: false }, // Household_ID__c = FFG + Name(2-digit)

    // Training Group (SF Id) if already known; otherwise resolved by ffgId at push time
    trainingGroupId: { field: "training_group_id", type: DataTypes.STRING, allowNull: true },

    uploadRunId: { field: "upload_run_id", type: DataTypes.UUID, allowNull: true },

    // Payload to send to SF (Household__c)
    payload: { type: DataTypes.JSONB, allowNull: false },

    status: { type: DataTypes.ENUM("pending", "processing", "failed", "sent"), defaultValue: "pending" },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    lastError: { field: "last_error", type: DataTypes.TEXT, allowNull: true },
    nextAttemptAt: { field: "next_attempt_at", type: DataTypes.DATE, defaultValue: () => new Date() },
  },
  { tableName: "household_outbox", underscored: true, timestamps: true }
);

export default HouseholdOutbox;
