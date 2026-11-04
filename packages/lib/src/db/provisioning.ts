import { count } from "drizzle-orm";
import { db } from "./db";
import { user } from "./schema";

export async function countUsers(): Promise<number> {
	const [row] = await db.select({ count: count() }).from(user);
	return row?.count ?? 0;
}
