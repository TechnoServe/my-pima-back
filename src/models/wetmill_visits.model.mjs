import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";

const WetmillVisit = sequelize.define(
  "wetmill_visits",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    wetmill_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "wetmills",
        key: "id",
      },
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    form_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    visit_date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    entrance_photograph: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    geo_location: {
      type: DataTypes.GEOMETRY("POINT", 4326),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "wetmill_visits",
    timestamps: false,
  }
);

export default WetmillVisit;
