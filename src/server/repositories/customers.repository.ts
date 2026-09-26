import "server-only";
import { and, asc, eq, ilike, ne, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers } from "@/db/schema";

export async function listCustomers(workspaceId: string, input: { search?: string; limit: number; offset: number }) {
  const search = input.search?.trim();
  return getDb().select().from(customers).where(and(
    eq(customers.workspaceId, workspaceId),
    ne(customers.status, "archived"),
    search ? or(
      ilike(customers.firstName, `%${search}%`),
      ilike(customers.lastName, `%${search}%`),
      ilike(customers.email, `%${search}%`),
      ilike(customers.phone, `%${search}%`),
    ) : undefined,
  )).orderBy(asc(customers.lastName), asc(customers.firstName)).limit(input.limit).offset(input.offset);
}

