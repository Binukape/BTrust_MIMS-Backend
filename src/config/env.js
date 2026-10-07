// Node creates process.env right, this line loads dotenv's configuration code,
// Which reads .env file and adds its value to process.env
import "dotenv/config";

// We are defining that unless these environment variables exist backend cannot work.
const required = [
    "DB_HOST",  // Where is MySQL
    "DB_PORT",  // Which port
    "DB_NAME",  // which database
    "DB_USER",  // Login username
    "DB_PASSWORD", // LOgin password
    "REPORTS_DB_USER",
    "REPORTS_DB_PASSWORD",
    "JWT_SECRET",
    "ALLOWED_ORIGIN"
];

// From above array we are filtering missing variables
const missing = required.filter((key) => !process.env[key]);  


if (missing.length > 0) {
  throw new Error(
    `Missing environment variables: ${missing.join(", ")} (see .env.example)`
  );
}


// It provides and exportable object called env which can be used by multiple files
export const env = {

    port: Number(process.env.PORT || 4000),
    nodeEnv: process.env.NODE_ENV || "development",

    db: {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    },

    reportsDb: {
        user: process.env.REPORTS_DB_USER,
        password: process.env.REPORTS_DB_PASSWORD,
    },

    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
    allowedOrigin: process.env.ALLOWED_ORIGIN.replace(/\/$/, ""),
};