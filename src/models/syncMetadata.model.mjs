// models/syncMetadata.model.mjs

import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";

const SyncMetadata = sequelize.define(
  "SyncMetadata",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    objectName: {
      field: "object_name",
      type: DataTypes.STRING,
      allowNull: false,
    },
    projectId: {
      field: "project_id",
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastSyncedAt: {
      field: "last_synced_at",
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "sync_metadata",
    underscored: true,
  }
);

export default SyncMetadata;
