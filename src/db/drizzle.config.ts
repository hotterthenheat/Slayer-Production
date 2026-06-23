import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

// TLS for migrations, mirroring the runtime pool (src/db/index.ts pgSslOption):
//   SQL_SSL=require/verify -> verify cert; no-verify/prefer -> encrypt only; else off.
const sslMode = (process.env.SQL_SSL || '').toLowerCase();
const migrationSsl: false | { rejectUnauthorized: boolean } =
  sslMode === 'require' || sslMode === 'verify' ? { rejectUnauthorized: true }
  : sslMode === 'no-verify' || sslMode === 'prefer' ? { rejectUnauthorized: false }
  : false;

const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER;
const password = process.env.SQL_ADMIN_PASSWORD;

if (!sqlHost) {
  throw new Error("SQL_HOST must be set in environment variables.");
}
if (!sqlDbName) {
  throw new Error("SQL_DB_NAME must be set in environment variables.");
}
if (!user) {
  throw new Error("SQL_ADMIN_USER must be set in environment variables.");
}
if (!password) {
  throw new Error("SQL_ADMIN_PASSWORD must be set in environment variables.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    host: sqlHost,
    user: user,
    password: password,
    database: sqlDbName,
    ssl: migrationSsl,
  },
  verbose: true,
});
