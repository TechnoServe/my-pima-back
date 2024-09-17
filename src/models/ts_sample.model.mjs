import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";
import Users from "./users.model.mjs";

const TsSample = sequelize.define("tbl_ts_sample", {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  sf_project_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  sf_training_session_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  sf_training_module_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  training_module_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  tg_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  tg_tns_id: {
    type: DataTypes.STRING,
  },
  total_attendance: {
    type: DataTypes.DECIMAL,
  },
  male_attendance: {
    type: DataTypes.DECIMAL,
  },
  female_attendance: {
    type: DataTypes.DECIMAL,
  },
  farmer_trainer_name: {
    type: DataTypes.STRING,
  },
  session_image_url: {
    type: DataTypes.STRING,
  },
  session_date: {
    type: DataTypes.DATE,
  },
  image_review_result: {
    type: DataTypes.ENUM("approved", "invalid", "unclear"),
    allowNull: true,
  },
  last_reviewed_by: {
    type: DataTypes.UUID,
    references: {
      model: Users,
      key: "user_id",
    },
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

export default TsSample;
