import { useState, useEffect } from "react";
import { getOnboardingUser, loadOnboardingProfile } from "@/application/queries/onboarding-wizard.query";
import { loadLastSiteImport } from "@/application/queries/onboarding-site-import.query";
import {
  saveOnboardingProgress,
  addOnboardingService,
  addOnboardingServices,
} from "@/application/commands/onboarding-wizard.command";
import { toast } from "@/components/ui/sonner";
import { OnboardingProgress } from "./OnboardingProgress";
import { SiteImportStep } from "./steps/SiteImportStep";
import { BusinessInfoStep } from "./steps/BusinessInfoStep";
import { ServiceAreaStep } from "./steps/ServiceAreaStep";
import { WorkingHoursStep } from "./steps/WorkingHoursStep";
import { FirstServiceStep } from "./steps/FirstServiceStep";
import { CompletionStep } from "./steps/CompletionStep";
import {
  acceptedServices,
  mergeSiteImport,
  type SiteImportResult,
  type SiteImportSelection,
  type SiteImportService,
} from "@/domain/onboarding/site-import-merge";
import type { GeoCoordinates, DayHoursConfig } from "@/shared/types/forms";

/** Step order — index 0 is the website import, index 5 is the completion screen. */
const STEP_LABELS = [
  "Import",
  "Business Info",
  "Service Area",
  "Hours",
  "Services",
  "Done",
];

const STEP_IMPORT = 0;
const STEP_SERVICES = 4;
const STEP_DONE = 5;

interface OnboardingData {
  business_name: string;
  owner_name: string;
  email: string;
  phone: string;
  logo_url: string | null;
  service_address: string;
  service_radius_miles: number;
  timezone: string;
  service_coordinates: { lat: number; lng: number } | null;
  working_days: string[];
  opening_time: string;
  closing_time: string;
  day_hours: Record<string, { open: string; close: string; isOpen: boolean }>;
  first_service: {
    name: string;
    description: string;
    price: number;
    duration: number;
  };
  website_url: string;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  brand_font_family: string | null;
  imported_services: SiteImportService[];
}

const getInitialData = (): OnboardingData => ({
  business_name: "",
  owner_name: "",
  email: "",
  phone: "",
  logo_url: null,
  service_address: "",
  service_radius_miles: 25,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  service_coordinates: null,
  working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  opening_time: "09:00",
  closing_time: "17:00",
  day_hours: {
    monday: { open: "09:00", close: "17:00", isOpen: true },
    tuesday: { open: "09:00", close: "17:00", isOpen: true },
    wednesday: { open: "09:00", close: "17:00", isOpen: true },
    thursday: { open: "09:00", close: "17:00", isOpen: true },
    friday: { open: "09:00", close: "17:00", isOpen: true },
    saturday: { open: "09:00", close: "17:00", isOpen: false },
    sunday: { open: "09:00", close: "17:00", isOpen: false },
  },
  first_service: {
    name: "",
    description: "",
    price: 0,
    duration: 30,
  },
  website_url: "",
  brand_primary_color: null,
  brand_secondary_color: null,
  brand_font_family: null,
  imported_services: [],
});

export const OnboardingWizard = () => {
  const [currentStep, setCurrentStep] = useState(STEP_IMPORT);
  const [data, setData] = useState<OnboardingData>(getInitialData());
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [priorImport, setPriorImport] = useState<SiteImportResult | null>(null);


  const loadExistingData = async () => {
    try {
      const onboardingUser = await getOnboardingUser();
      if (!onboardingUser) return;

      setUserId(onboardingUser.id);

      const [profile, lastImport] = await Promise.all([
        loadOnboardingProfile(onboardingUser.id),
        loadLastSiteImport(onboardingUser.id).catch((): null => null),
      ]);

      if (lastImport?.result) setPriorImport(lastImport.result);

      if (profile) {
        setData((prev) => ({
          ...prev,
          business_name: profile.business_name || "",
          owner_name: profile.owner_name || "",
          email: profile.email || onboardingUser.email || "",
          phone: profile.phone || "",
          logo_url: profile.logo_url,
          service_address: profile.service_address || "",
          service_radius_miles: profile.service_radius_miles || 25,
          timezone: profile.timezone || prev.timezone,
          service_coordinates: (profile.service_coordinates as unknown as GeoCoordinates) || null,
          day_hours: (profile.day_hours as unknown as DayHoursConfig) || prev.day_hours,
          website_url: (profile as { website_url?: string }).website_url || "",
        }));

        const storedStep = profile.onboarding_step ?? 0;
        if (storedStep > 0) {
          // Legacy rows were saved before the import step existed (0-based on
          // Business Info). Shift them by one unless the owner already ran an
          // import, in which case the stored step is already in new numbering.
          const resumeStep = lastImport ? storedStep : Math.min(storedStep + 1, STEP_SERVICES);
          setCurrentStep(resumeStep);
        }
      } else {
        setData((prev) => ({
          ...prev,
          email: onboardingUser.email || "",
        }));
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadExistingData());
  }, []);

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const saveProgress = async (step: number, complete = false) => {
    if (!userId) return;

    setSaving(true);
    try {
      const workingDays = Object.entries(data.day_hours)
        .filter(([_, v]) => v.isOpen)
        .map(([k]) => k);

      await saveOnboardingProgress({
        user_id: userId,
        business_name: data.business_name,
        owner_name: data.owner_name,
        email: data.email,
        phone: data.phone,
        logo_url: data.logo_url,
        service_address: data.service_address,
        service_radius_miles: data.service_radius_miles,
        timezone: data.timezone,
        service_coordinates: data.service_coordinates,
        working_days: workingDays,
        day_hours: data.day_hours,
        website_url: data.website_url || null,
        brand_primary_color: data.brand_primary_color,
        brand_secondary_color: data.brand_secondary_color,
        brand_font_family: data.brand_font_family,
        onboarding_step: step,
        onboarding_completed: complete,
      });
    } catch (error) {
      console.error("Error saving progress:", error);
      toast.error("Failed to save progress");
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    await saveProgress(currentStep + 1);
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  /** Apply the confirmed website-import suggestions and continue. */
  const handleApplyImport = (result: SiteImportResult, selection: SiteImportSelection) => {
    const services = acceptedServices(result, selection);
    setData((prev) => {
      const merged = mergeSiteImport(prev, result, selection);
      return {
        ...merged,
        website_url: prev.website_url || result.source_url,
        imported_services: services,
        first_service:
          prev.first_service.name || services.length === 0
            ? prev.first_service
            : {
                name: services[0].name,
                description: services[0].description,
                price: services[0].price ?? 0,
                duration: services[0].duration_minutes,
              },
      };
    });
    toast.success(
      services.length > 0
        ? `Prefilled your details and ${services.length} service${services.length === 1 ? "" : "s"}`
        : "Prefilled your business details",
    );
    setCurrentStep(STEP_IMPORT + 1);
  };

  const handleSkipImport = () => setCurrentStep(STEP_IMPORT + 1);

  const handleSkipService = async () => {
    await handleComplete();
  };

  const handleAddService = async () => {
    if (!userId) {
      await handleComplete();
      return;
    }

    try {
      if (data.imported_services.length > 0) {
        const count = await addOnboardingServices(userId, data.imported_services);
        if (count > 0) toast.success(`${count} service${count === 1 ? "" : "s"} added!`);
      } else if (data.first_service.name) {
        await addOnboardingService(userId, data.first_service);
        toast.success("Service added!");
      }
      await handleComplete();
    } catch (error) {
      console.error("Error adding service:", error);
      toast.error("Failed to add services");
    }
  };

  const handleComplete = async () => {
    await saveProgress(STEP_DONE, true);
    setCurrentStep(STEP_DONE);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <SiteImportStep
            onApply={handleApplyImport}
            onSkip={handleSkipImport}
            initialResult={priorImport}
          />
        );
      case 1:
        return (
          <BusinessInfoStep
            data={{
              business_name: data.business_name,
              owner_name: data.owner_name,
              email: data.email,
              phone: data.phone,
              logo_url: data.logo_url,
            }}
            onUpdate={updateData}
            onNext={handleNext}
          />
        );
      case 2:
        return (
          <ServiceAreaStep
            data={{
              service_address: data.service_address,
              service_radius_miles: data.service_radius_miles,
              timezone: data.timezone,
              service_coordinates: data.service_coordinates,
            }}
            onUpdate={updateData}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 3:
        return (
          <WorkingHoursStep
            data={{
              working_days: data.working_days,
              opening_time: data.opening_time,
              closing_time: data.closing_time,
              day_hours: data.day_hours,
            }}
            onUpdate={updateData}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 4:
        return (
          <>
            {data.imported_services.length > 0 && (
              <div className="max-w-md mx-auto mb-6 rounded-lg border bg-muted/40 p-4 text-sm">
                <p className="font-medium">
                  {data.imported_services.length} service
                  {data.imported_services.length === 1 ? "" : "s"} from your website will be added
                </p>
                <p className="text-muted-foreground mt-1">
                  You can edit prices and details any time in your service catalog.
                </p>
              </div>
            )}
            <FirstServiceStep
              data={data.first_service}
              onUpdate={(updates) =>
                updateData({ first_service: { ...data.first_service, ...updates } })
              }
              onNext={handleAddService}
              onBack={handleBack}
              onSkip={handleSkipService}
            />
          </>
        );
      case 5:
        return <CompletionStep businessName={data.business_name || "Your business"} />;
      default:
        return null;
    }
  };

  const totalSteps = STEP_LABELS.length - 1;

  return (
    <div className="min-h-screen bg-background">
      {/* Header — no exit button, onboarding is mandatory */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {totalSteps + 1}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="pt-20 pb-12 px-4">
        <div className="max-w-4xl mx-auto">
          {currentStep < STEP_DONE && (
            <OnboardingProgress
              currentStep={currentStep}
              totalSteps={totalSteps}
              stepLabels={STEP_LABELS.slice(0, -1)}
            />
          )}

          <div className="mt-8">{renderStep()}</div>
        </div>
      </div>
    </div>
  );
};
