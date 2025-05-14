import { DataTypes } from "sequelize";
import sequelize from "../config/db.mjs";
import Roles from "./roles.model.mjs";
import WetmillVisit from "./wetmill_visits.model.mjs";

const Users = sequelize.define("tbl_users", {
  user_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  sf_user_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  user_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  user_password: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  user_email: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  mobile_no: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  role_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: "tbl_roles",
      key: "role_id",
    },
  },
  account_status: {
    type: DataTypes.ENUM("active", "inactive"),
    allowNull: false,
    defaultValue: "active",
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

Roles.hasMany(Users, {
  foreignKey: "role_id",
  onDelete: "CASCADE",
});

Users.belongsTo(Roles, {
  foreignKey: "role_id",
});

Users.hasMany(WetmillVisit, {
  foreignKey: "user_id",
  as: "wetmill_visits",
});

WetmillVisit.belongsTo(Users, {
  foreignKey: "user_id",
  as: "user",
});

export default Users;
