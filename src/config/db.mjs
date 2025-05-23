import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const sequelize = new Sequelize(
  process.env.PG_DATABASE,
  process.env.PG_USER,
  process.env.PG_PASSWORD,
  {
    host: process.env.PG_HOST,
    dialect: "postgres",
    protocol: "postgres",
    dialectOptions: {
      // turn SSL on if your environment needs it
      ssl: false,
      native: true,
    },
    logging: false,

    // ↑↑↑ your existing options ↑↑↑

    // ↓↓↓ new pool settings ↓↓↓
    pool: {
      max: 20,       // allow up to 20 concurrent connections
      min: 0,
      acquire: 600000,  // wait up to 10 minutes for a free connection
      idle: 10000       // release idle connections after 10 seconds
    },
  }
);

sequelize
  .authenticate()
  .then(() => {
    console.log("Connection has been established successfully.");
  })
  .catch((err) => {
    console.error("Unable to connect to the database:", err);
  });

export default sequelize;
