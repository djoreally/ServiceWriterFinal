import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, vehicles } from "@/db/schema";

export async function listVehicles(workspaceId: string, input: { limit: number; offset: number }) {
  return getDb().select({
    id:vehicles.id,customerId:vehicles.customerId,status:vehicles.status,vin:vehicles.vin,year:vehicles.year,
    make:vehicles.make,model:vehicles.model,trim:vehicles.trim,mileage:vehicles.mileage,mileageUnit:vehicles.mileageUnit,
    createdAt:vehicles.createdAt,customerFirstName:customers.firstName,customerLastName:customers.lastName,
  }).from(vehicles)
    .leftJoin(customers,and(eq(customers.workspaceId,workspaceId),eq(customers.id,vehicles.customerId)))
    .where(and(eq(vehicles.workspaceId, workspaceId),ne(vehicles.status, "archived")))
    .orderBy(desc(vehicles.createdAt)).limit(input.limit).offset(input.offset);
}
