import { z } from "zod";
import { APPOINTMENT_LIFECYCLE } from "@packages/shared/lifecycle";

// Customer validation schema
export const customerSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters")
    .transform(val => val.trim()),
  email: z.string()
    .email("Please enter a valid email address")
    .max(255, "Email must be less than 255 characters")
    .optional()
    .or(z.literal("")),
  phone: z.string()
    .max(30, "Phone number is too long")
    .optional()
    .or(z.literal("")),
  address: z.string()
    .max(500, "Address must be less than 500 characters")
    .optional()
    .or(z.literal("")),
  notes: z.string()
    .max(2000, "Notes must be less than 2000 characters")
    .optional()
    .or(z.literal("")),
});

// Vehicle validation schema
export const vehicleSchema = z.object({
  make: z.string()
    .min(1, "Make is required")
    .max(50, "Make must be less than 50 characters")
    .transform(val => val.trim()),
  model: z.string()
    .min(1, "Model is required")
    .max(50, "Model must be less than 50 characters")
    .transform(val => val.trim()),
  year: z.number()
    .min(1900, "Year must be 1900 or later")
    .max(new Date().getFullYear() + 2, "Year cannot be more than 2 years in the future"),
  vin: z.string()
    .max(17, "VIN must be 17 characters or less")
    .optional()
    .or(z.literal("")),
  license_plate: z.string()
    .max(20, "License plate must be less than 20 characters")
    .optional()
    .or(z.literal("")),
  color: z.string()
    .max(30, "Color must be less than 30 characters")
    .optional()
    .or(z.literal("")),
  mileage: z.number()
    .min(0, "Mileage cannot be negative")
    .max(10000000, "Mileage is too high")
    .optional()
    .nullable(),
  notes: z.string()
    .max(2000, "Notes must be less than 2000 characters")
    .optional()
    .or(z.literal("")),
});

// Service validation schema
export const serviceSchema = z.object({
  service_type: z.string()
    .min(1, "Service type is required")
    .max(100, "Service type must be less than 100 characters")
    .transform(val => val.trim()),
  description: z.string()
    .min(1, "Description is required")
    .max(2000, "Description must be less than 2000 characters")
    .transform(val => val.trim()),
  service_date: z.string()
    .min(1, "Service date is required"),
  labor_hours: z.number()
    .min(0, "Labor hours cannot be negative")
    .max(1000, "Labor hours is too high")
    .optional()
    .nullable(),
  labor_cost: z.number()
    .min(0, "Labor cost cannot be negative")
    .max(10000000, "Labor cost is too high")
    .optional()
    .nullable(),
  parts_cost: z.number()
    .min(0, "Parts cost cannot be negative")
    .max(10000000, "Parts cost is too high")
    .optional()
    .nullable(),
  parts_used: z.string()
    .max(2000, "Parts used must be less than 2000 characters")
    .optional()
    .or(z.literal("")),
  status: z.enum(["pending", "in_progress", "in-progress", "completed", "cancelled"]),
  notes: z.string()
    .max(2000, "Notes must be less than 2000 characters")
    .optional()
    .or(z.literal("")),
});

// Inventory item validation schema
export const inventorySchema = z.object({
  name: z.string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters")
    .transform(val => val.trim()),
  description: z.string()
    .max(500, "Description must be less than 500 characters")
    .optional()
    .or(z.literal("")),
  sku: z.string()
    .max(50, "SKU must be less than 50 characters")
    .optional()
    .or(z.literal("")),
  category: z.string()
    .max(50, "Category must be less than 50 characters")
    .optional()
    .or(z.literal("")),
  quantity: z.number()
    .min(0, "Quantity cannot be negative")
    .max(1000000, "Quantity is too high"),
  unit_cost: z.number()
    .min(0, "Unit cost cannot be negative")
    .max(10000000, "Unit cost is too high"),
  sell_price: z.number()
    .min(0, "Sell price cannot be negative")
    .max(10000000, "Sell price is too high"),
  low_stock_threshold: z.number()
    .min(0, "Low stock threshold cannot be negative")
    .max(100000, "Low stock threshold is too high"),
  image_url: z.string()
    .url("Image URL must be a valid URL")
    .optional()
    .or(z.literal("")),
  reorder_url: z.string()
    .url("Reorder link must be a valid URL")
    .optional()
    .or(z.literal("")),
});

// Quote validation schema
export const quoteSchema = z.object({
  description: z.string()
    .min(1, "Description is required")
    .max(2000, "Description must be less than 2000 characters")
    .transform(val => val.trim()),
  quote_date: z.string()
    .min(1, "Quote date is required"),
  valid_until: z.string()
    .optional()
    .or(z.literal("")),
  labor_hours: z.number()
    .min(0, "Labor hours cannot be negative")
    .max(1000, "Labor hours is too high")
    .optional()
    .nullable(),
  labor_cost: z.number()
    .min(0, "Labor cost cannot be negative")
    .max(10000000, "Labor cost is too high")
    .optional()
    .nullable(),
  status: z.enum(["pending", "accepted", "rejected", "expired"]),
  notes: z.string()
    .max(2000, "Notes must be less than 2000 characters")
    .optional()
    .or(z.literal("")),
});

// Appointment validation schema
export const appointmentSchema = z.object({
  title: z.string()
    .min(1, "Title is required")
    .max(200, "Title must be less than 200 characters")
    .transform(val => val.trim()),
  description: z.string()
    .max(2000, "Description must be less than 2000 characters")
    .optional()
    .or(z.literal("")),
  scheduled_date: z.string()
    .min(1, "Date is required"),
  scheduled_time: z.string()
    .min(1, "Time is required"),
  duration_minutes: z.number()
    .min(15, "Duration must be at least 15 minutes")
    .max(480, "Duration cannot exceed 8 hours"),
  estimated_cost: z.number()
    .min(0, "Estimated cost cannot be negative")
    .max(10000000, "Estimated cost is too high")
    .optional()
    .nullable(),
  status: z.enum(APPOINTMENT_LIFECYCLE),
  notes: z.string()
    .max(2000, "Notes must be less than 2000 characters")
    .optional()
    .or(z.literal("")),
});

// Public booking validation schema (used in PublicBooking.tsx)
export const bookingSchema = z.object({
  name: z.string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters")
    .transform(val => val.trim()),
  email: z.string()
    .email("Please enter a valid email address")
    .max(255, "Email must be less than 255 characters")
    .transform(val => val.trim()),
  phone: z.string()
    .min(1, "Phone number is required")
    .max(20, "Phone number is too long")
    .transform(val => val?.trim()),
});

// Inline customer creation validation
export const inlineCustomerSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters")
    .transform(val => val.trim()),
  email: z.string()
    .email("Please enter a valid email address")
    .max(255, "Email must be less than 255 characters")
    .optional()
    .or(z.literal(""))
    .transform(val => val?.trim()),
  phone: z.string()
    .max(30, "Phone number is too long")
    .optional()
    .or(z.literal(""))
    .transform(val => val?.trim()),
});

// Inline vehicle creation validation
export const inlineVehicleSchema = z.object({
  make: z.string()
    .min(1, "Make is required")
    .max(50, "Make must be less than 50 characters")
    .transform(val => val.trim()),
  model: z.string()
    .min(1, "Model is required")
    .max(50, "Model must be less than 50 characters")
    .transform(val => val.trim()),
  year: z.number()
    .min(1900, "Year must be 1900 or later")
    .max(new Date().getFullYear() + 2, "Year cannot be more than 2 years in the future"),
  vin: z.string()
    .max(17, "VIN must be 17 characters or less")
    .optional()
    .or(z.literal(""))
    .transform(val => val?.trim()),
  license_plate: z.string()
    .max(20, "License plate must be less than 20 characters")
    .optional()
    .or(z.literal(""))
    .transform(val => val?.trim()),
});

// Helper function to get first validation error
export const getFirstError = (result: z.ZodSafeParseResult<unknown>): string | null => {
  if (result.success) return null;
  return result.error.issues[0]?.message || "Validation error";
};

// Type exports
export type CustomerFormData = z.infer<typeof customerSchema>;
export type VehicleFormData = z.infer<typeof vehicleSchema>;
export type ServiceFormData = z.infer<typeof serviceSchema>;
export type InventoryFormData = z.infer<typeof inventorySchema>;
export type QuoteFormData = z.infer<typeof quoteSchema>;
export type AppointmentFormData = z.infer<typeof appointmentSchema>;
export type BookingFormData = z.infer<typeof bookingSchema>;
