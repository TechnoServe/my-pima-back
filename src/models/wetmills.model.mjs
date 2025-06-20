import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";
import WetmillVisit from "./wetmill_visits.model.mjs";

const Wetmills = sequelize.define(
  "wetmills",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    wet_mill_unique_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    commcare_case_id: {
      type: DataTypes.STRING,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
    },
    mill_status: {
      type: DataTypes.STRING,
    },
    exporting_status: {
      type: DataTypes.STRING,
    },
    programme: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    country: {
      type: DataTypes.STRING,
    },
    manager_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    manager_role: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    comments: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    wetmill_counter: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    ba_signature: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    manager_signature: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tor_page_picture: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    registration_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    // Note: To use geo_location with POINT type in Sequelize, PostGIS must be enabled
    // geo_location: {
    //   type: DataTypes.GEOMETRY("POINT", 4326),
    //   allowNull: true,
    // },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
    },
  },
  {
    timestamps: false,
  }
);

Wetmills.hasMany(WetmillVisit, {
  foreignKey: "wetmill_id",
  as: "wetmill_visits",
});

WetmillVisit.belongsTo(Wetmills, {
  foreignKey: "wetmill_id",
  as: "wetmill",
});

export default Wetmills;
