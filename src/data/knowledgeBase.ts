import { BookOpen, CalendarClock, CreditCard, LucideIcon, Settings, Users, Wrench } from "lucide-react";

export interface KnowledgeBaseCategory {
  label: string;
  slug: string;
  icon: LucideIcon;
  color: string;
}

export interface KnowledgeBaseArticle {
  id: string;
  title: string;
  description: string;
  category: string;
  readTime: string;
}

export const KNOWLEDGE_BASE_CATEGORIES: KnowledgeBaseCategory[] = [
  { label: "Getting Started", slug: "getting-started", icon: BookOpen, color: "bg-blue-500/10 text-blue-600" },
  { label: "Customers & Vehicles", slug: "customers-vehicles", icon: Users, color: "bg-gray-500/10 text-gray-600" },
  { label: "Services & Catalog", slug: "services-catalog", icon: Wrench, color: "bg-orange-500/10 text-orange-600" },
  { label: "Appointments", slug: "appointments", icon: CalendarClock, color: "bg-purple-500/10 text-purple-600" },
  { label: "Payments & Billing", slug: "payments-billing", icon: CreditCard, color: "bg-amber-500/10 text-amber-600" },
  { label: "Settings & Account", slug: "settings-account", icon: Settings, color: "bg-slate-500/10 text-slate-600" },
];

export const KNOWLEDGE_BASE_ARTICLES: KnowledgeBaseArticle[] = [
  { id: "1", title: "Setting up your shop profile", description: "Configure your business name, logo, hours, and contact info.", category: "Getting Started", readTime: "3 min" },
  { id: "2", title: "Understanding the dashboard", description: "Overview of key metrics, charts, and quick actions on your home screen.", category: "Getting Started", readTime: "4 min" },
  { id: "3", title: "Connecting to Stripe for payments", description: "Step-by-step guide to onboarding your Stripe Connect account.", category: "Getting Started", readTime: "5 min" },
  { id: "4", title: "Adding and managing customers", description: "Create customer profiles, add notes, and track service history.", category: "Customers & Vehicles", readTime: "3 min" },
  { id: "5", title: "Vehicle records and VIN lookup", description: "Add vehicles, decode VINs, and link them to customers.", category: "Customers & Vehicles", readTime: "4 min" },
  { id: "6", title: "Customizing your service catalog", description: "Edit default services, set pricing, and create custom offerings.", category: "Services & Catalog", readTime: "4 min" },
  { id: "7", title: "Creating service packages", description: "Bundle services together for discounted pricing.", category: "Services & Catalog", readTime: "3 min" },
  { id: "8", title: "Subscription plans for recurring revenue", description: "Set up monthly plans customers can subscribe to.", category: "Services & Catalog", readTime: "5 min" },
  { id: "9", title: "Managing your appointment calendar", description: "View, create, and reschedule appointments from the calendar.", category: "Appointments", readTime: "4 min" },
  { id: "10", title: "Setting up availability & working hours", description: "Configure when customers can book and how far in advance.", category: "Appointments", readTime: "3 min" },
  { id: "11", title: "Processing payments", description: "Accept in-person and online payments through Stripe.", category: "Payments & Billing", readTime: "4 min" },
  { id: "12", title: "Invoices and receipts", description: "Generate, send, and track invoices for completed services.", category: "Payments & Billing", readTime: "3 min" },
  { id: "13", title: "Team members and roles", description: "Invite technicians, set permissions, and manage your team.", category: "Settings & Account", readTime: "4 min" },
  { id: "14", title: "Notification preferences", description: "Control email and push notification settings.", category: "Settings & Account", readTime: "2 min" },
];
