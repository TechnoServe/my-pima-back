// models/uploadRun.model.mjs
import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";

const UploadRun = sequelize.define(
  "UploadRun",
  {
    id:         { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    projectId:  { field: "project_id", type: DataTypes.STRING, allowNull: false },

    status:     { type: DataTypes.ENUM("running", "completed", "failed", "canceled"), defaultValue: "running" },
    startedAt:  { field: "started_at", type: DataTypes.DATE, defaultValue: () => new Date() },
    finishedAt: { field: "finished_at", type: DataTypes.DATE, allowNull: true },
    meta:       { type: DataTypes.JSONB, allowNull: true },

    // NEW
    fileUrl:    { field: "file_url",  type: DataTypes.TEXT, allowNull: true },
    fileName:   { field: "file_name", type: DataTypes.TEXT, allowNull: true },
    fileBytes:  { field: "file_bytes", type: DataTypes.BIGINT, allowNull: true },
    mimeType:   { field: "mime_type", type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: "upload_runs", underscored: true, timestamps: true }
);

export default UploadRun;
