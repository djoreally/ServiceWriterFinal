import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search,
  Play,
  Clock,
  Video,
  BookOpen,
  CreditCard,
  Users,
  Settings,
  Wrench,
  CalendarClock,
  ExternalLink,
} from "lucide-react";

interface Tutorial {
  id: string;
  title: string;
  description: string;
  duration: string;
  category: string;
  thumbnail?: string;
}

const CATEGORIES = [
  "All",
  "Getting Started",
  "Customers",
  "Services",
  "Appointments",
  "Payments",
  "Settings",
];

const TUTORIALS: Tutorial[] = [
  {
    id: "1",
    title: "Welcome to Service Writer",
    description: "A quick 5-minute tour of the platform and key features.",
    duration: "5:12",
    category: "Getting Started",
  },
  {
    id: "2",
    title: "Setting Up Your Shop Profile",
    description: "Configure your business name, logo, hours, address, and booking slug.",
    duration: "3:45",
    category: "Getting Started",
  },
  {
    id: "3",
    title: "Connecting Stripe for Payments",
    description: "Walk through Stripe Connect onboarding to accept payments.",
    duration: "4:30",
    category: "Getting Started",
  },
  {
    id: "4",
    title: "Managing Customers & Vehicles",
    description: "Add customers, link vehicles, decode VINs, and track history.",
    duration: "6:15",
    category: "Customers",
  },
  {
    id: "5",
    title: "Customizing Your Service Catalog",
    description: "Edit preconfigured services, add custom ones, and set pricing.",
    duration: "4:50",
    category: "Services",
  },
  {
    id: "6",
    title: "Creating Service Packages & Subscriptions",
    description: "Bundle services and set up recurring subscription plans.",
    duration: "7:20",
    category: "Services",
  },
  {
    id: "7",
    title: "Booking & Appointment Management",
    description: "Set availability, manage calendar, and handle appointment workflow.",
    duration: "5:40",
    category: "Appointments",
  },
  {
    id: "8",
    title: "Processing Payments & Invoices",
    description: "Accept payments, generate invoices, and track financials.",
    duration: "4:15",
    category: "Payments",
  },
  {
    id: "9",
    title: "Team Management & Permissions",
    description: "Invite technicians, assign roles, and manage team access.",
    duration: "3:30",
    category: "Settings",
  },
  {
    id: "10",
    title: "Using the AI Assistant",
    description: "Learn how the AI assistant helps with daily shop operations.",
    duration: "4:00",
    category: "Getting Started",
  },
];

const Tutorials = () => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const filtered = TUTORIALS.filter((t) => {
    const matchesSearch =
      !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "All" || t.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <AppLayout title="Video Tutorials">
      {/* Search */}
      <div className="max-w-2xl mx-auto mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search tutorials..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-11 h-12 text-base"
          />
        </div>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2 mb-8">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Tutorials grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Video className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-1">No tutorials found</h3>
          <p className="text-muted-foreground">Try a different search or category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((tutorial) => (
            <Card
              key={tutorial.id}
              className="group cursor-pointer overflow-hidden hover:shadow-lg transition-all hover:border-primary/30"
            >
              {/* Thumbnail placeholder */}
              <div className="relative aspect-video bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                <div className="w-14 h-14 rounded-md bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                  <Play className="h-6 w-6 text-primary ml-0.5" />
                </div>
                <div className="absolute bottom-2 right-2">
                  <Badge variant="secondary" className="text-[10px] bg-black/60 text-white border-0">
                    <Clock className="h-3 w-3 mr-1" />
                    {tutorial.duration}
                  </Badge>
                </div>
              </div>
              <CardContent className="p-4">
                <Badge variant="outline" className="text-[10px] mb-2">{tutorial.category}</Badge>
                <h3 className="font-semibold text-sm group-hover:text-primary transition-colors mb-1">
                  {tutorial.title}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2">{tutorial.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
};

export default Tutorials;
