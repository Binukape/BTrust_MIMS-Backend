import mysql from "mysql2/promise";
import { env } from "./env.js";

const common = {
    host: env.db.host,
    port: env.db.port,
    database: env.db.database,
    waitForConnections: true,
    queueLimit: 0,
    dateStrings: true,
    decimalNumbers: false,
};

export const pool = mysql.createPool({
    ...common,
    user: env.db.user,
    password: env.db.password,
    connectionLimit: 20,
});

export const reportsPool = mysql.createPool({
    ...common,
    user: env.reportsDb.user,
    password: env.reportsDb.password,
    connectionLimit: 5,
});

// Test to check whether pool worked

// const connection = await pool.getConnection();

// console.log("Database connected successfully");

// connection.release();