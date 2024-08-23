import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";
import FarmVisit from "./farm_visit.model.mjs";

const BestPractice = sequelize.define("tbl_best_practices", {
  practice_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  sf_practice_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  visit_id: {
    type: DataTypes.UUID,
    references: {
      model: FarmVisit,
      key: "visit_id",
    },
  },
  practice_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  question: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
  answer: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
  correct_answer: {
    type: DataTypes.ENUM("yes", "no", "unclear"),
    allowNull: true,
    defaultValue: null,
  },
  comments: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  image_url: {
    type: DataTypes.STRING,
    allowNull: true,
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

FarmVisit.hasMany(BestPractice, {
  foreignKey: "visit_id",
  onDelete: "CASCADE",
  as: "BestPractices",
});

BestPractice.belongsTo(FarmVisit, {
  foreignKey: "visit_id",
  as: "FarmVisit",
});

export default BestPractice;
