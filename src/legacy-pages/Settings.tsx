import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search } from "lucide-react";
import { EmbedCodeSection } from "@/components/settings/EmbedCodeSection";
import { getCurrentUser, fetchBusinessProfileDirect, checkSlugDirect } from "@/application/queries/settings-page.query";
import { isReservedSubdomain } from "@/lib/reserved-subdomains";

import { uploadCoverImage, uploadLogo, upsertBusinessProfile } from "@/application/commands/settings-page.command";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import useIsClient from "@/hooks/useIsClient";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building, Upload, Save, Loader2, Tags, Globe, Clock, Link, Copy, ExternalLink, CheckCircle2, XCircle, MapPin, Navigation, DollarSign, ClipboardCheck, Bot } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { toast } from "@/components/ui/sonner";
import { useTerminology, Terminology } from "@/contexts/TerminologyContext";
import { useRegionalSettings, CURRENCIES, TIMEZONES } from "@/contexts/RegionalSettingsContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { LazyServiceAreaMap } from "@/components/settings/LazyServiceAreaMap";
import { StripeConnectCard } from "@/components/settings/StripeConnectCard";
import { StripePaymentMethodsCard } from "@/components/settings/StripePaymentMethodsCard";
import { PaymentProviderCard } from "@/components/settings/PaymentProviderCard";
import { ProviderSyncStatusCard } from "@/components/settings/ProviderSyncStatusCard";
import { MarketingSettings } from "@/components/settings/MarketingSettings";
import { EmailSettings } from "@/components/settings/EmailSettings";
import { SmsCreditsCard } from "@/components/settings/SmsCreditsCard";
import { SmsSettings } from "@/components/settings/SmsSettings";
import { PaymentSettings } from "@/components/settings/PaymentSettings";
import { TaxSettings } from "@/components/settings/TaxSettings";
import { QuickBooksSettings } from "@/components/settings/QuickBooksSettings";
import { BillingSettings } from "@/components/settings/BillingSettings";
import { CashDrawerSettings } from "@/components/settings/CashDrawerSettings";
import { InspectionTemplateManager } from "@/components/inspections/InspectionTemplateManager";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/mapbox";
import { TeamMembersSettings } from "@/components/settings/TeamMembersSettings";
import { AutoDispatchSettings } from "@/components/settings/AutoDispatchSettings";
import { WeatherGuardSettings } from "@/components/settings/WeatherGuardSettings";
import { CalendarIntegration } from "@/components/settings/CalendarIntegration";
import { LinkHealthSection } from "@/components/settings/LinkHealthSection";
import { VoiceAgentSettings } from "@/components/settings/VoiceAgentSettings";
import { TrackingSettings } from "@/components/settings/TrackingSettings";
import type { Json } from "@/integrations/supabase/types";
import { parseWeatherGuardSettings, type WeatherGuardSettings as WGSettings, DEFAULT_WEATHER_GUARD_SETTINGS } from "@/lib/weather-guard";
import { OfflineSyncDashboard } from "@/components/offline/OfflineSyncDashboard";
import { GDPRDataManagement } from "@/components/settings/GDPRDataManagement";
import type { ServiceAreaRule } from "@/lib/serviceArea";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
interface BusinessProfile {
  id?: string;
  user_id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  email: string;
  address: string;
  website_url: string;
  logo_url: string;
  cover_image_url: string;
  terminology: Terminology;
  date_format: string;
  timezone: string;
  currency: string;
  opening_time: string;
  closing_time: string;
  working_days: string[];
  booking_slug: string;
  service_radius_miles: number;
  marketplace_opt_in: boolean;
  service_address: string;
  service_coordinates: { lat: number; lng: number } | null;
  weather_guard_enabled: boolean;
  weather_guard_settings: WGSettings;
  day_hours?: Record<string, unknown> | null;
}

type SettingsTabId =
  | "business"
  | "booking"
  | "team"
  | "payments"
  | "comms"
  | "integrations"
  | "advanced";

const SETTINGS_TABS: ReadonlyArray<{
  id: SettingsTabId;
  label: string;
  icon: typeof Building;
  description: string;
  sections: string[];
}> = [
  {
    id: "business",
    label: "Business",
    icon: Building,
    description: "Profile, regional settings, terminology",
    sections: ["Business Profile", "Regional", "Terminology", "Date", "Currency", "Timezone"],
  },
  {
    id: "booking",
    label: "Booking & Hours",
    icon: Link,
    description: "Booking link, hours, service area, weather",
    sections: ["Booking", "Hours", "Service Area", "Services", "Catalog", "Weather", "Embed", "Subdomain", "Working Days"],
  },
  {
    id: "team",
    label: "Team & Dispatch",
    icon: Navigation,
    description: "Team members and auto-dispatch engine",
    sections: ["Team", "Members", "Dispatch", "Technician"],
  },
  {
    id: "payments",
    label: "Payments & Tax",
    icon: DollarSign,
    description: "Stripe/Square, billing, tax, QuickBooks, cash drawer",
    sections: ["Payment", "Tax", "QuickBooks", "QBO", "Cash Drawer", "Stripe", "Square", "Billing", "Subscription", "Deposit"],
  },
  {
    id: "comms",
    label: "Comms & Marketing",
    icon: Tags,
    description: "Marketing, email, SMS, voice agent",
    sections: ["Marketing", "Email", "SMTP", "Voice", "Agent", "ElevenLabs", "Newsletter"],
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: Globe,
    description: "Calendar, inspections, link health",
    sections: ["Google Calendar", "Calendar", "Inspection", "Templates", "Link Health"],
  },
  {
    id: "advanced",
    label: "Advanced",
    icon: ClipboardCheck,
    description: "Offline sync, GDPR data management",
    sections: ["Offline", "Sync", "GDPR", "Data", "Export", "Erasure"],
  },
];

const Settings = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sectionSearch, setSectionSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugInput, setSlugInput] = useState("");
  const [geocodingAddress, setGeocodingAddress] = useState(false);
  const [serviceAreaRules, setServiceAreaRules] = useState<ServiceAreaRule[]>([]);
  const serviceAddressInputRef = useRef<HTMLInputElement>(null);
  const { terms, setTerms, refetch } = useTerminology();
  const { refetch: refetchRegional } = useRegionalSettings();
  const isClient = useIsClient();
  const [profile, setProfile] = useState<BusinessProfile>({
    user_id: "",
    business_name: "",
    owner_name: "",
    phone: "",
    email: "",
    address: "",
    website_url: "",
    logo_url: "",
    cover_image_url: "",
    terminology: {
      customer: "Customer",
      vehicle: "Vehicle",
      service: "Service",
      quote: "Quote",
    },
    date_format: "DD/MM/YYYY HH:mm",
    timezone: "UTC",
    currency: "USD",
    opening_time: "08:00",
    closing_time: "17:00",
    working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    booking_slug: "",
    service_radius_miles: 25,
    marketplace_opt_in: false,
    service_address: "",
    service_coordinates: null,
    weather_guard_enabled: false,
    weather_guard_settings: { ...DEFAULT_WEATHER_GUARD_SETTINGS },
    day_hours: null,
  });

  useEffect(() => {
    const fetchProfile = async () => {
      const user = await getCurrentUser();
      if (!user) return;

      const { data, error } = await fetchBusinessProfileDirect(user.id);

      if (data) {
        const terminology = data.terminology && typeof data.terminology === "object" && !Array.isArray(data.terminology)
          ? {
              customer: typeof (data.terminology as Record<string, unknown>).customer === "string" ? (data.terminology as Record<string, unknown>).customer as string : "Customer",
              vehicle: typeof (data.terminology as Record<string, unknown>).vehicle === "string" ? (data.terminology as Record<string, unknown>).vehicle as string : "Vehicle",
              service: typeof (data.terminology as Record<string, unknown>).service === "string" ? (data.terminology as Record<string, unknown>).service as string : "Service",
              quote: typeof (data.terminology as Record<string, unknown>).quote === "string" ? (data.terminology as Record<string, unknown>).quote as string : "Quote",
            }
          : { customer: "Customer", vehicle: "Vehicle", service: "Service", quote: "Quote" };
        
        setProfile({
          ...data,
          terminology,
          date_format: data.date_format || "DD/MM/YYYY HH:mm",
          timezone: data.timezone || "UTC",
          currency: data.currency || "USD",
          opening_time: data.opening_time || "08:00",
          closing_time: data.closing_time || "17:00",
          working_days: data.working_days || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          booking_slug: data.booking_slug || "",
          website_url: data.website_url || "",
          cover_image_url: (data as { cover_image_url?: string | null }).cover_image_url || "",
          service_radius_miles: data.service_radius_miles || 25,
          marketplace_opt_in: (data as { marketplace_opt_in?: boolean }).marketplace_opt_in ?? false,
          service_address: data.service_address || "",
          service_coordinates: (data.service_coordinates as { lat: number; lng: number } | null) || null,
          weather_guard_enabled: (data as Record<string, unknown>).weather_guard_enabled as boolean ?? false,
          weather_guard_settings: parseWeatherGuardSettings((data as Record<string, unknown>).weather_guard_settings),
          day_hours: (data as Record<string, unknown>).day_hours as Record<string, unknown> | null ?? null,
        });
        const rawDayHours = (data as Record<string, unknown>).day_hours as Record<string, unknown> | null;
        const areaRules = rawDayHours && Array.isArray(rawDayHours.service_area_rules)
          ? (rawDayHours.service_area_rules as ServiceAreaRule[])
          : [];
        setServiceAreaRules(areaRules);
        setSlugInput(data.booking_slug || "");
        if (data.booking_slug) {
          setSlugAvailable(true);
        }
      } else {
        setProfile(prev => ({ ...prev, user_id: user.id, email: user.email || "" }));
      }
      setLoading(false);
    };

    fetchProfile();
  }, []);

  const checkSlugAvailability = async (slug: string) => {
    if (!slug || slug.length < 3) {
      setSlugAvailable(null);
      return;
    }

    // Validate slug format (only lowercase letters, numbers, hyphens)
    const validSlug = /^[a-z0-9-]+$/.test(slug);
    if (!validSlug) {
      setSlugAvailable(false);
      return;
    }

    // Infrastructure hostnames (auth, app, api …) are reserved: handing one out
    // would shadow a platform host such as the OAuth consent domain.
    if (isReservedSubdomain(slug)) {
      setSlugAvailable(false);
      setCheckingSlug(false);
      toast.error(`"${slug}" is a reserved subdomain. Please choose another.`);
      return;
    }


    setCheckingSlug(true);
    
    const user = await getCurrentUser();
    const { data, error } = await checkSlugDirect(slug);

    if (error) {
      setSlugAvailable(null);
      setCheckingSlug(false);
      return;
    }

    // Available if no one has it, or if current user already owns it
    const isAvailable = !data || data.user_id === user?.id;
    setSlugAvailable(isAvailable);
    setCheckingSlug(false);
  };

  const handleSlugChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlugInput(sanitized);
    setSlugAvailable(null);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const user = await getCurrentUser();
    if (!user) {
      toast.error("Your session has expired. Sign in again to continue.");
      setUploading(false);
      return;
    }

    try {
      const publicUrl = await uploadLogo(user.id, file);
      setProfile(prev => ({ ...prev, logo_url: publicUrl }));
      toast.success("Logo uploaded successfully");
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      setUploading(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const user = await getCurrentUser();
    if (!user) {
      toast.error("Your session has expired. Sign in again to continue.");
      setUploading(false);
      return;
    }

    try {
      const publicUrl = await uploadCoverImage(user.id, file);
      setProfile(prev => ({ ...prev, cover_image_url: publicUrl }));
      toast.success("Cover image uploaded successfully");
    } catch {
      toast.error("Failed to upload cover image");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const user = await getCurrentUser();
    if (!user) {
      toast.error("Your session has expired. Sign in again to continue.");
      setSaving(false);
      return;
    }

    const websiteInput = profile.website_url.trim();
    let normalizedWebsiteUrl = websiteInput;

    // Validate website_url if provided (auto-prefix https:// when protocol is omitted)
    if (websiteInput) {
      try {
        if (!/^https?:\/\//i.test(normalizedWebsiteUrl)) {
          normalizedWebsiteUrl = `https://${normalizedWebsiteUrl}`;
        }
        const url = new URL(normalizedWebsiteUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          toast.error("Website URL must start with http:// or https://");
          setSaving(false);
          return;
        }
        normalizedWebsiteUrl = url.toString();
      } catch {
        toast.error("Please enter a valid website URL");
        setSaving(false);
        return;
      }
    }

    // If user is trying to save a new slug, validate it
    if (slugInput && slugInput !== profile.booking_slug) {
      if (slugAvailable !== true) {
        toast.error("Please check slug availability before saving");
        setSaving(false);
        return;
      }
    }

    const profileData = {
      user_id: user.id,
      business_name: profile.business_name,
      owner_name: profile.owner_name,
      phone: profile.phone,
      email: profile.email,
      address: profile.address,
      website_url: normalizedWebsiteUrl || null,
      logo_url: profile.logo_url,
      cover_image_url: profile.cover_image_url || null,
      terminology: JSON.parse(JSON.stringify(profile.terminology)) as Json,
      date_format: profile.date_format,
      timezone: profile.timezone,
      currency: "USD",
      opening_time: profile.opening_time,
      closing_time: profile.closing_time,
      working_days: profile.working_days,
      booking_slug: slugInput || profile.booking_slug || null,
      service_radius_miles: profile.service_radius_miles,
      service_address: profile.service_address,
      service_coordinates: profile.service_coordinates as Json,
      marketplace_opt_in: profile.marketplace_opt_in,
      weather_guard_enabled: profile.weather_guard_enabled,
      weather_guard_settings: JSON.parse(JSON.stringify(profile.weather_guard_settings)) as Json,
      day_hours: JSON.parse(JSON.stringify({
        ...(profile.day_hours || {}),
        service_area_rules: serviceAreaRules,
      })) as Json,
    };

    const { error } = await upsertBusinessProfile(user.id, profileData as Record<string, unknown>);

    if (error) {
      if (error.code === '23505') {
        toast.error("This booking link is already taken. Please choose another.");
        setSlugAvailable(false);
      } else {
        console.error("[Settings] Profile save error:", error);
        toast.error(`Could not save changes: ${error.message || "Check required fields and try again."}`);
      }
    } else {
      setProfile(prev => ({ ...prev, booking_slug: slugInput || prev.booking_slug }));
      setTerms(profile.terminology);
      await refetch();
      await refetchRegional();
      toast.success("Profile saved successfully");
    }
    setSaving(false);
  };

  const handleTerminologyChange = (key: keyof Terminology, value: string) => {
    setProfile(prev => ({
      ...prev,
      terminology: { ...prev.terminology, [key]: value },
    }));
  };

  const serviceDisplayMode = profile.day_hours?.public_booking_service_display_mode === "category_first"
    ? "category_first"
    : "full_list";

  const setServiceDisplayMode = (mode: "category_first" | "full_list") => {
    setProfile(prev => ({
      ...prev,
      day_hours: {
        ...(prev.day_hours || {}),
        public_booking_service_display_mode: mode,
      },
    }));
  };

  const geocodeServiceAddress = async () => {
    if (!profile.service_address.trim()) {
      toast.error("Please enter a service address");
      return;
    }

    setGeocodingAddress(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(profile.service_address)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`
      );
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        const fullAddress = data.features[0].place_name;
        setProfile(prev => ({
          ...prev,
          service_address: fullAddress,
          service_coordinates: { lat, lng },
        }));
        toast.success("Address verified and coordinates saved!");
      } else {
        toast.error("Could not find this address. Please check and try again.");
      }
    } catch (error) {
      toast.error("Failed to verify address. Please try again.");
    }
    setGeocodingAddress(false);
  };

  const activeTab = (searchParams.get("tab") as SettingsTabId) || "business";
  const setActiveTab = (id: SettingsTabId) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    setSearchParams(next, { replace: true });
  };

  const filteredTabs = useMemo(() => {
    if (!sectionSearch.trim()) return SETTINGS_TABS;
    const q = sectionSearch.toLowerCase();
    return SETTINGS_TABS.filter((t) =>
      t.label.toLowerCase().includes(q) ||
      t.sections.some((s) => s.toLowerCase().includes(q)),
    );
  }, [sectionSearch]);

  if (loading) {
    return (
      <AppLayout title="Settings">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }


  return (
    <AppLayout title="Settings">
      <div className="space-y-6 pb-24">
        <div>
          <h2 className="text-3xl font-bold mb-2">Settings</h2>
          <p className="text-muted-foreground">Find and manage every part of your business in one place.</p>
        </div>

        {/* Quick Access Dashboard */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search settings (e.g. tax, hours, email, calendar)…"
                value={sectionSearch}
                onChange={(e) => setSectionSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {filteredTabs.map((t) => {
                const Icon = t.icon;
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setActiveTab(t.id); setSectionSearch(""); }}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      isActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className={`rounded-md p-2 ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-none">{t.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                    </div>
                  </button>
                );
              })}
              {filteredTabs.length === 0 && (
                <p className="col-span-full text-sm text-muted-foreground py-2">
                  No settings match "{sectionSearch}".
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTabId)} className="w-full">
          <TabsList className="w-full overflow-x-auto justify-start h-auto flex-wrap gap-1 bg-muted/40 p-1">
            {SETTINGS_TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="gap-2">
                <t.icon className="h-4 w-4" />
                <span>{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ======================== BUSINESS TAB ======================== */}
          <TabsContent value="business" className="space-y-6 mt-6 max-w-3xl">

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Business Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Logo Upload */}
            <div className="flex items-center gap-6">
              <Avatar className="h-24 w-24">
                <AvatarImage src={profile.logo_url} alt="Business logo" />
                <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                  {profile.business_name?.charAt(0) || "B"}
                </AvatarFallback>
              </Avatar>
              <div>
                <Label htmlFor="logo-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Upload Logo
                  </div>
                  <Input
                    id="logo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                    disabled={uploading}
                  />
                </Label>
                <p className="text-xs text-muted-foreground mt-2">
                  PNG, JPG up to 2MB
                </p>
              </div>
            </div>

            {/* Cover Image Upload */}
            <div className="space-y-3">
              <Label htmlFor="cover-upload">Cover Image</Label>
              <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
                {profile.cover_image_url ? (
                  <img src={profile.cover_image_url} alt="Business cover" className="h-36 w-full object-cover" />
                ) : (
                  <div className="flex h-36 w-full items-center justify-center text-sm text-muted-foreground">
                    No cover image uploaded yet
                  </div>
                )}
              </div>
              <Label htmlFor="cover-upload" className="cursor-pointer">
                <div className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-secondary-foreground transition-colors hover:bg-secondary/80">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload Cover Image
                </div>
                <Input
                  id="cover-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverUpload}
                  disabled={uploading}
                />
              </Label>
            </div>

            {/* Business Information */}
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="business_name">Business Name</Label>
                <Input
                  id="business_name"
                  placeholder="Your Auto Shop Name"
                  value={profile.business_name}
                  onChange={(e) => setProfile(prev => ({ ...prev, business_name: e.target.value }))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="owner_name">Owner Name</Label>
                <Input
                  id="owner_name"
                  placeholder="John Smith"
                  value={profile.owner_name}
                  onChange={(e) => setProfile(prev => ({ ...prev, owner_name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="shop@example.com"
                    value={profile.email}
                    onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={profile.phone}
                    onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  placeholder="123 Main Street, City, State 12345"
                  value={profile.address}
                  onChange={(e) => setProfile(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="website_url">Website URL</Label>
                <Input
                  id="website_url"
                  type="url"
                  placeholder="https://www.yourshop.com"
                  value={profile.website_url}
                  onChange={(e) => setProfile(prev => ({ ...prev, website_url: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Your business website (optional)</p>
              </div>
            </div>
          </CardContent>
        </Card>

          </TabsContent>

          {/* ======================== BOOKING TAB (Link + Embed) ======================== */}
          <TabsContent value="booking" className="space-y-6 mt-6 max-w-3xl">
        {/* Online Booking Link */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link className="h-5 w-5" />
              Online Booking Link
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Create a custom booking link to share with your customers
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="booking_slug">Your Subdomain</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="booking_slug"
                  value={slugInput}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="your-shop-name"
                  className="flex-1 font-mono"
                />
                <div className="flex items-center bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground whitespace-nowrap">
                  .servicewriter.xyz
                </div>
                <Button
                  variant="outline"
                  onClick={() => checkSlugAvailability(slugInput)}
                  disabled={checkingSlug || !slugInput || slugInput.length < 3}
                >
                  {checkingSlug ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Check"
                  )}
                </Button>
              </div>
              
              {/* Availability status */}
              {slugInput && slugInput.length >= 3 && slugAvailable !== null && (
                <div className="space-y-3">
                  <div className={`flex items-center gap-2 text-sm ${slugAvailable ? 'text-gray-600' : 'text-destructive'}`}>
                    {slugAvailable ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>This subdomain is available!</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4" />
                        <span>This subdomain is taken or invalid. Use only lowercase letters, numbers, and hyphens.</span>
                      </>
                    )}
                  </div>
                  
                  {/* Show confirm button when available and not yet saved */}
                  {slugAvailable && slugInput !== profile.booking_slug && (
                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      className="gap-2"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Confirm & Activate Subdomain
                    </Button>
                  )}
                </div>
              )}
              
              {slugInput && slugInput.length < 3 && (
                <p className="text-xs text-muted-foreground">
                  Must be at least 3 characters. Use lowercase letters, numbers, and hyphens only.
                </p>
              )}
            </div>

            {/* Show active link if exists */}
            {profile.booking_slug && (
              <div className="pt-4 border-t border-border space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <Label className="text-base font-semibold">Your Subdomain is Live!</Label>
                </div>
                
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="flex-1 min-w-0 bg-background px-3 py-2 rounded-md text-sm font-mono truncate border">
                      https://{profile.booking_slug}.servicewriter.xyz
                    </code>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        if (typeof navigator !== 'undefined' && navigator.clipboard) {
                          navigator.clipboard.writeText(`https://${profile.booking_slug}.servicewriter.xyz`);
                          toast.success("Booking link copied to clipboard!");
                        } else {
                          toast.error("Copy not available in this environment");
                        }
                      }}
                    >
                      <Copy className="h-4 w-4" />
                      Copy Link
                    </Button>
                    
                    {isClient && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={async () => {
                          try {
                            await navigator.share({
                              title: `Book with ${profile.business_name || 'us'}`,
                              text: `Book your appointment online!`,
                              url: `https://${profile.booking_slug}.servicewriter.xyz`,
                            });
                          } catch (err) {
                            // User cancelled or share failed silently
                          }
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Share
                      </Button>
                    )}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          window.open(`https://${profile.booking_slug}.servicewriter.xyz`, '_blank');
                        }
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Preview
                    </Button>
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Share this link with customers. Make sure you have active services in your Service Catalog.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Public Service Selection
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose how customers browse your services during public booking.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setServiceDisplayMode("full_list")}
                className={`rounded-lg border p-4 text-left transition-colors ${serviceDisplayMode === "full_list" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
              >
                <p className="font-semibold">Full service list</p>
                <p className="mt-1 text-sm text-muted-foreground">Show every service immediately, with search and category filters.</p>
              </button>
              <button
                type="button"
                onClick={() => setServiceDisplayMode("category_first")}
                className={`rounded-lg border p-4 text-left transition-colors ${serviceDisplayMode === "category_first" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
              >
                <p className="font-semibold">Categories first</p>
                <p className="mt-1 text-sm text-muted-foreground">Start customers with compact category cards before showing services.</p>
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              This setting is saved with your profile and applies to the service step on your public booking page.
            </p>
          </CardContent>
        </Card>

        {/* Embed Codes — only shown when a slug is active */}
{/* (still in booking) */}
        {profile.booking_slug && <EmbedCodeSection currentSlug={profile.booking_slug} />}

          </TabsContent>

          {/* ======================== TEAM TAB ======================== */}
          <TabsContent value="team" className="space-y-6 mt-6 max-w-3xl">
        {/* Team Members */}
        <TeamMembersSettings />

        {/* Auto-Dispatch Engine */}
{/* (still in team) */}
        <div>
          <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <span>⚡</span> Dispatch Automation
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Configure the algorithm that automatically assigns the best available technician to each job based on skills, proximity, workload, and performance.
          </p>
          <AutoDispatchSettings />
        </div>

          </TabsContent>

          {/* ======================== PAYMENTS TAB ======================== */}
          <TabsContent value="payments" className="space-y-6 mt-6 max-w-3xl">
        {/* Payment Provider Selection (Stripe / Square) */}
        <PaymentProviderCard />

        {/* Provider Sync Status — UI for Stripe/Square push pipeline */}
        <ProviderSyncStatusCard />

        {/* Read-only mirror of payment methods enabled on the connected Stripe Standard account */}
        <StripePaymentMethodsCard />

        {/* Platform Subscription Billing */}
{/* (still in payments) */}
        <BillingSettings />

        {/* Payment & Financial Controls */}
{/* (still in payments) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Payment & Financial Controls
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage deposits, taxes, and promotional codes
            </p>
          </CardHeader>
          <CardContent>
            <PaymentSettings />
          </CardContent>
        </Card>

        {/* Location-Based Tax Settings */}
{/* (still in payments) */}
        <TaxSettings />

        {/* QuickBooks Online Integration */}
{/* (still in payments) */}
        <QuickBooksSettings />

        {/* Cash Drawer Integration */}
{/* (still in payments) */}
        <CashDrawerSettings />

          </TabsContent>

          {/* ======================== COMMS TAB ======================== */}
          <TabsContent value="comms" className="space-y-6 mt-6 max-w-3xl">
        {/* Prepaid SMS credits */}
        <SmsCreditsCard />

        {/* SMS automation toggles + templates */}
        <SmsSettings />

        {/* Marketing Settings */}
        <MarketingSettings />

        <TrackingSettings />

        {/* Email Settings - White Label SMTP */}
{/* (still in comms) */}
        <EmailSettings />




          </TabsContent>

          {/* ===== BUSINESS TAB (Regional Settings) ===== */}
          <TabsContent value="business" className="space-y-6 mt-6 max-w-3xl">
        {/* Regional Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Regional Settings
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Configure date format, timezone, and currency for your business
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="date_format">Date & Time Format</Label>
                <Select
                  value={profile.date_format}
                  onValueChange={(value) => setProfile(prev => ({ ...prev, date_format: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY HH:mm">DD/MM/YYYY HH:MM (24h)</SelectItem>
                    <SelectItem value="MM/DD/YYYY hh:mm A">MM/DD/YYYY HH:MM AM/PM</SelectItem>
                    <SelectItem value="YYYY-MM-DD HH:mm">YYYY-MM-DD HH:MM (ISO)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">How dates appear throughout the app</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={profile.timezone}
                  onValueChange={(value) => setProfile(prev => ({ ...prev, timezone: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(tz => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label} ({tz.offset})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Your business timezone</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value="USD"
                  onValueChange={() => setProfile(prev => ({ ...prev, currency: "USD" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.filter((c) => c.code === "USD").map(c => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} ({c.symbol}) - {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Currency for prices and invoices</p>
              </div>
            </div>
          </CardContent>
        </Card>

          </TabsContent>

          {/* ===== BOOKING TAB (Hours, Service Area, Weather) ===== */}
          <TabsContent value="booking" className="space-y-6 mt-6 max-w-3xl">
        {/* Business Hours */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Business Hours
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Set your shop's operating hours and working days
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="opening_time">Opening Time</Label>
                <Input
                  id="opening_time"
                  type="time"
                  value={profile.opening_time}
                  onChange={(e) => setProfile(prev => ({ ...prev, opening_time: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="closing_time">Closing Time</Label>
                <Input
                  id="closing_time"
                  type="time"
                  value={profile.closing_time}
                  onChange={(e) => setProfile(prev => ({ ...prev, closing_time: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Working Days</Label>
              <div className="flex flex-wrap gap-3">
                {DAYS_OF_WEEK.map(day => (
                  <label key={day} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={profile.working_days.includes(day)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setProfile(prev => ({
                            ...prev,
                            working_days: [...prev.working_days, day],
                          }));
                        } else {
                          setProfile(prev => ({
                            ...prev,
                            working_days: prev.working_days.filter(d => d !== day),
                          }));
                        }
                      }}
                    />
                    <span className="text-sm">{day}</span>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Service Area */}
{/* (still in booking) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="h-5 w-5" />
              Service Area
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Set your service radius to define the area you serve. Customers outside this area will not be able to book online.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="service_address">Business Location (Base Address)</Label>
                <div className="flex gap-2">
                  <Input
                    id="service_address"
                    ref={serviceAddressInputRef}
                    value={profile.service_address}
                    onChange={(e) => setProfile(prev => ({ ...prev, service_address: e.target.value, service_coordinates: null }))}
                    placeholder="Enter your business address"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={geocodeServiceAddress}
                    disabled={geocodingAddress}
                  >
                    {geocodingAddress ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">Verify</span>
                  </Button>
                </div>
                {profile.service_coordinates && (
                  <p className="text-xs text-success flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Address verified - coordinates saved
                  </p>
                )}
                {!profile.service_coordinates && profile.service_address && (
                  <p className="text-xs text-muted-foreground">
                    Click "Verify" to confirm your address and enable service area validation
                  </p>
                )}
              </div>

              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="service_radius">Service Radius</Label>
                  <span className="text-lg font-semibold text-primary">{profile.service_radius_miles} miles</span>
                </div>
                <Slider
                  id="service_radius"
                  min={5}
                  max={100}
                  step={5}
                  value={[profile.service_radius_miles]}
                  onValueChange={(value) => setProfile(prev => ({ ...prev, service_radius_miles: value[0] }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>5 miles</span>
                  <span>50 miles</span>
                  <span>100 miles</span>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Marketplace Visibility</p>
                    <p className="text-xs text-muted-foreground">
                      Opt in to show your business in the Find Provider marketplace.
                    </p>
                  </div>
                  <Switch
                    checked={profile.marketplace_opt_in}
                    onCheckedChange={(checked) => setProfile(prev => ({ ...prev, marketplace_opt_in: checked }))}
                    aria-label="Toggle marketplace visibility"
                  />
                </div>
              </div>
            </div>

            {profile.service_coordinates && (
              <div className="space-y-4">
                <div>
                  <p className="font-medium mb-3">Service Area Preview</p>
                  <LazyServiceAreaMap
                    coordinates={profile.service_coordinates}
                    radiusMiles={profile.service_radius_miles}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Customers within {profile.service_radius_miles} miles of your business location will be able to book online.
                  Others will be notified that your services are not available in their area.
                </p>
              </div>
            )}

            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Advanced Area Rules</p>
                  <p className="text-xs text-muted-foreground">
                    Manage multi-area day-based coverage in Availability → Service Areas.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => navigate("/availability?tab=areas")}>
                  Manage Areas
                </Button>
              </div>
              {serviceAreaRules.length === 0 ? (
                <p className="text-xs text-muted-foreground">No advanced service areas configured yet.</p>
              ) : (
                <div className="space-y-2">
                  {serviceAreaRules.slice(0, 4).map((area) => (
                    <div key={area.id} className="flex items-center justify-between text-xs rounded border p-2 bg-muted/20">
                      <span className="font-medium">{area.label || area.address || "Unnamed Area"}</span>
                      <span className="text-muted-foreground">{area.radius_miles || 0} mi • {(area.days || []).length} days</span>
                    </div>
                  ))}
                  {serviceAreaRules.length > 4 && (
                    <p className="text-xs text-muted-foreground">+{serviceAreaRules.length - 4} more area rules</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Weather Guard */}
{/* (still in booking) */}
        <WeatherGuardSettings
          enabled={profile.weather_guard_enabled}
          settings={profile.weather_guard_settings as unknown as Json}
          hasCoordinates={!!profile.service_coordinates}
          onEnabledChange={(v) => setProfile(prev => ({ ...prev, weather_guard_enabled: v }))}
          onSettingsChange={(s) => setProfile(prev => ({ ...prev, weather_guard_settings: s }))}
        />

          </TabsContent>

          {/* ===== BUSINESS TAB (Terminology — completes Profile/Regional block) ===== */}
          <TabsContent value="business" className="space-y-6 mt-6 max-w-3xl">
        {/* Terminology Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tags className="h-5 w-5" />
              Terminology
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Customize the labels used throughout the app to match your business
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="term_customer">Customer Label</Label>
                <Input
                  id="term_customer"
                  placeholder="Customer, Client, Account..."
                  value={profile.terminology.customer}
                  onChange={(e) => handleTerminologyChange("customer", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">e.g., Client, Account, Contact</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="term_vehicle">Vehicle Label</Label>
                <Input
                  id="term_vehicle"
                  placeholder="Vehicle, Unit, Asset..."
                  value={profile.terminology.vehicle}
                  onChange={(e) => handleTerminologyChange("vehicle", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">e.g., Unit, Asset, Equipment</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="term_service">Service Label</Label>
                <Input
                  id="term_service"
                  placeholder="Service, Work Order, Job..."
                  value={profile.terminology.service}
                  onChange={(e) => handleTerminologyChange("service", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">e.g., Work Order, Job, Repair</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="term_quote">Quote Label</Label>
                <Input
                  id="term_quote"
                  placeholder="Quote, Estimate, Proposal..."
                  value={profile.terminology.quote}
                  onChange={(e) => handleTerminologyChange("quote", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">e.g., Estimate, Proposal, Bid</p>
              </div>
            </div>
          </CardContent>
        </Card>

          </TabsContent>

          {/* ===== COMMS TAB (Voice Agent — completes Marketing/Email block) ===== */}
          <TabsContent value="comms" className="space-y-6 mt-6 max-w-3xl">
        {/* Voice Agent */}
        <VoiceAgentSettings />

          </TabsContent>

          {/* ======================== INTEGRATIONS TAB ======================== */}
          <TabsContent value="integrations" className="space-y-6 mt-6 max-w-3xl">
        {/* Google Calendar Integration */}
        <CalendarIntegration />

        {/* Inspection Templates */}
{/* (still in integrations) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Inspection Templates
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Create reusable inspection checklists for your services
            </p>
          </CardHeader>
          <CardContent>
            <InspectionTemplateManager />
          </CardContent>
        </Card>

        {/* Agent integrations (MCP) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Agent integrations
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Connect ChatGPT, Claude, or Cursor to your workspace so an assistant can read your schedule, customers,
              and service catalog.
            </p>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="gap-2 rounded-md" onClick={() => navigate("/agent-integrations")}>
              <Bot className="h-4 w-4" />
              View connection instructions
            </Button>
          </CardContent>
        </Card>

        {/* Link Health */}
{/* (still in integrations) */}
        <LinkHealthSection />


          </TabsContent>

          {/* ======================== ADVANCED TAB ======================== */}
          <TabsContent value="advanced" className="space-y-6 mt-6 max-w-3xl">
        {/* Offline Sync */}
        <OfflineSyncDashboard />

        {/* GDPR Data Management */}
        <GDPRDataManagement />
          </TabsContent>
        </Tabs>

        {/* Sticky Save Footer */}
        <div className="fixed bottom-0 left-0 right-0 md:left-[var(--sidebar-width,16rem)] z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-3 flex items-center justify-end gap-3">
          <p className="text-xs text-muted-foreground hidden sm:block">
            Changes affect Business, Booking & Hours, and related settings.
          </p>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save settings
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default Settings;
