import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";
import Users from "./users.model.mjs";

const FarmVisit = sequelize.define("tbl_farm_visits", {
  visit_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  sf_visit_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  farmer_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  farmer_pima_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  farmer_tns_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  date_visited: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  farmer_trainer: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  overall_status: {
    type: DataTypes.ENUM("Reviewed", "Not Reviewed"),
    allowNull: false,
    defaultValue: "Not Reviewed",
  },
  last_reviewed_by: {
    type: DataTypes.UUID,
    references: {
      model: Users,
      key: "user_id",
    },
  },
  date_sampled: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
  },
});

Users.hasMany(FarmVisit, {
  foreignKey: "last_reviewed_by",
  onDelete: "CASCADE",
});

FarmVisit.belongsTo(Users, {
  foreignKey: "last_reviewed_by",
});

export default FarmVisit;
