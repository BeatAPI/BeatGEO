import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }), {
	schema,
});
