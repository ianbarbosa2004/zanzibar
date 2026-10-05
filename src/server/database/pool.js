import mysql from "mysql2/promise";
import { databaseConfigured, databaseHost, databaseName, databaseUser } from "../config.js";

export const dbPool = databaseConfigured ? mysql.createPool({
  host: databaseHost,
  port: Number(process.env.CLAREZA_DB_PORT) || 3306,
  user: databaseUser,
  password: process.env.CLAREZA_DB_PASSWORD,
  database: databaseName,
  waitForConnections: true,
  connectionLimit: 5,
  charset: "utf8mb4",
}) : null;
