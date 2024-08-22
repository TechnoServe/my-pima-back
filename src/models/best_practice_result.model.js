import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";
import BestPractice from "./best_practice.model.mjs";

const BestPracticeResults = sequelize.define("tbl_best_practice_results", {
  result_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  sf_result_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  practice_id: {
    type: DataTypes.UUID,
    references: {
      model: BestPractice,
      key: "practice_id",
    },
  },
  method_result: {
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

BestPractice.hasMany(BestPracticeResults, {
  foreignKey: "practice_id",
  onDelete: "CASCADE",
});

BestPracticeResults.belongsTo(BestPractice, {
  foreignKey: "practice_id",
});

export default BestPracticeResults;
