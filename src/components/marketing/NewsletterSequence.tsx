import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import {
  fetchNewsletterSequences,
  fetchNewsletterTemplates,
  fetchSubscriberCount,
  type NewsletterTemplateRow,
} from "@/application/queries/newsletter.query";
import {
  createNewsletterSequence,
  toggleNewsletterTemplateActive,
  saveNewsletterTemplate,
} from "@/application/commands/newsletter.command";
import { useAuth } from "@packages/auth";
import { 
  Calendar, 
  Mail, 
  Send, 
  Edit, 
  Eye, 
  Play, 
  Pause, 
  Plus,
  Snowflake,
  Heart,
  Sparkles,
  Sun,
  Leaf,
  Gift,
  Flag,
  PartyPopper,
  Users,
  BarChart3
} from "lucide-react";

interface NewsletterTemplate {
  id?: string;
  month_number: number;
  subject: string;
  preview_text: string;
  content: string;
  holiday_theme: string;
  seasonal_theme: string;
  is_active: boolean;
}

interface NewsletterSequence {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  start_date: string;
}

// Personalization tokens available in all templates
const PERSONALIZATION_TOKENS = [
  { token: '{{customer_name}}', description: 'Customer full name', example: 'John Smith' },
  { token: '{{first_name}}', description: 'Customer first name', example: 'John' },
  { token: '{{vehicle_info}}', description: 'Vehicle year, make, model', example: '2020 Toyota Camry' },
  { token: '{{vehicle_year}}', description: 'Vehicle year', example: '2020' },
  { token: '{{vehicle_make}}', description: 'Vehicle make', example: 'Toyota' },
  { token: '{{vehicle_model}}', description: 'Vehicle model', example: 'Camry' },
  { token: '{{shop_name}}', description: 'Your shop name', example: 'Elite Auto Service' },
  { token: '{{booking_link}}', description: 'Online booking URL', example: 'https://...' },
];

// Pre-configured 12 monthly templates with holidays and seasonal content
const DEFAULT_TEMPLATES: NewsletterTemplate[] = [
  {
    month_number: 1,
    subject: "🎊 New Year, New Maintenance Goals",
    preview_text: "Kick off the year with a winter safety check and savings",
    holiday_theme: "New Year's Day",
    seasonal_theme: "Winter",
    content: `Hi {{first_name}},

Happy New Year from {{shop_name}}!

Start 2026 with confidence by giving your {{vehicle_info}} a fresh maintenance reset.

🎉 **January Offer: Winter Safety Check**
- Battery health test
- Tire pressure and tread inspection
- Coolant and antifreeze check
- Wiper blade performance review
- Heater and defrost inspection

Book this month and save **15%** on recommended winter services.

📅 **Book now:** {{booking_link}}

Safe travels,
The Team at {{shop_name}}`,
    is_active: true,
  },
  {
    month_number: 2,
    subject: "❤️ February Car Care Special",
    preview_text: "Show your vehicle some love with preventative maintenance",
    holiday_theme: "Valentine's Day",
    seasonal_theme: "Winter",
    content: `Hi {{first_name}},

This month, show your {{vehicle_make}} a little love.

❤️ **Valentine's Special: Love Your Car Package**
- Oil and filter service
- Brake visual inspection
- Battery terminal cleaning
- Fluid top-off
- Complimentary multi-point check

Preventative care now helps avoid surprise repairs later.

📅 **Reserve your spot:** {{booking_link}}

With appreciation,
{{shop_name}}`,
    is_active: true,
  },
  {
    month_number: 3,
    subject: "🍀 Spring Tune-Up Savings Inside",
    preview_text: "Refresh your ride for spring weather and road trips",
    holiday_theme: "St. Patrick's Day",
    seasonal_theme: "Spring",
    content: `Hi {{first_name}},

Spring is around the corner, which means it's tune-up time.

🍀 **March Offer: Spring Readiness Service**
- Air filter check
- A/C performance test
- Alignment and tire wear review
- Suspension quick check
- Cabin filter inspection

Drive into spring with better comfort, efficiency, and safety.

📅 **Schedule service:** {{booking_link}}

See you soon,
The Team at {{shop_name}}`,
    is_active: true,
  },
  {
    month_number: 4,
    subject: "🌧️ Rainy Season Safety Reminder",
    preview_text: "April maintenance tips for wet roads and better visibility",
    holiday_theme: "Earth Day",
    seasonal_theme: "Spring",
    content: `Hi {{first_name}},

April showers can make driving unpredictable.

🌍 **Earth Day + Safety Focus**
- Wiper blade replacement options
- Tire traction check
- Headlight and taillight inspection
- Windshield chip review
- Eco-friendly oil options available

Come in this month for a wet-weather safety inspection and drive with confidence.

📅 **Book your appointment:** {{booking_link}}

Thanks for supporting local,
{{shop_name}}`,
    is_active: true,
  },
  {
    month_number: 5,
    subject: "🎖️ Memorial Day Road Trip Prep",
    preview_text: "Travel-ready inspections before summer plans begin",
    holiday_theme: "Memorial Day",
    seasonal_theme: "Spring/Summer",
    content: `Hi {{first_name}},

Memorial Day travel season is almost here.

🚗 **May Offer: Pre-Trip Confidence Check**
- 40-point road trip inspection
- Tire and spare tire check
- Brake performance check
- Cooling system review
- Battery load test

Avoid mid-trip stress and start summer on the right foot.

📅 **Plan ahead and book:** {{booking_link}}

Wishing you safe travels,
The Team at {{shop_name}}`,
    is_active: true,
  },
  {
    month_number: 6,
    subject: "☀️ Stay Cool This Summer",
    preview_text: "June A/C and cooling-system specials are now available",
    holiday_theme: "Father's Day",
    seasonal_theme: "Summer",
    content: `Hi {{first_name}},

Hot weather is here — is your A/C ready?

☀️ **June Offer: Beat-the-Heat Service**
- A/C performance test
- Cabin airflow check
- Cooling system pressure review
- Belt and hose visual inspection
- Refrigerant service recommendations

Make every drive cooler and more comfortable this summer.

📅 **Book A/C service:** {{booking_link}}

Regards,
{{shop_name}}`,
    is_active: true,
  },
  {
    month_number: 7,
    subject: "🎆 Mid-Summer Reliability Check",
    preview_text: "Keep your vehicle dependable through peak travel season",
    holiday_theme: "Independence Day",
    seasonal_theme: "Summer",
    content: `Hi {{first_name}},

July is one of the busiest driving months of the year.

🎆 **Independence Month Special**
- Battery and charging-system test
- Tire pressure calibration
- Brake condition check
- Fluid condition scan
- Quick under-hood safety review

A quick mid-summer check can prevent major breakdowns.

📅 **Claim your July slot:** {{booking_link}}

Drive safe,
The Team at {{shop_name}}`,
    is_active: true,
  },
  {
    month_number: 8,
    subject: "📚 Back-to-School Vehicle Safety",
    preview_text: "Make daily commutes safer before the school rush",
    holiday_theme: "Back to School",
    seasonal_theme: "Late Summer",
    content: `Hi {{first_name}},

Back-to-school traffic is here, and safety matters more than ever.

🎒 **August Offer: Family Safety Service**
- Brake and rotor inspection
- Tire tread depth check
- Lights and signal test
- Wiper performance test
- Child seat anchor quick review

Protect your family with a proactive safety appointment.

📅 **Schedule now:** {{booking_link}}

Thank you,
{{shop_name}}`,
    is_active: true,
  },
  {
    month_number: 9,
    subject: "🍂 Fall Maintenance Starts Now",
    preview_text: "Prepare for cooler mornings and changing road conditions",
    holiday_theme: "Labor Day",
    seasonal_theme: "Fall",
    content: `Hi {{first_name}},

As temperatures start dropping, September is perfect for preventive maintenance.

🍂 **Labor Day Month Offer**
- Battery health check
- Tire pressure adjustment for cooler weather
- Heater and defroster test
- Wiper and washer fluid review
- Brake response inspection

Stay ahead of seasonal wear before cold weather arrives.

📅 **Book fall service:** {{booking_link}}

Best,
The Team at {{shop_name}}`,
    is_active: true,
  },
  {
    month_number: 10,
    subject: "🎃 Don’t Get Spooked by Unexpected Repairs",
    preview_text: "October pre-winter checks to reduce surprise breakdowns",
    holiday_theme: "Halloween",
    seasonal_theme: "Fall",
    content: `Hi {{first_name}},

A little prevention this month can save you from scary repair bills later.

🎃 **October Offer: Pre-Winter Inspection**
- Starter and battery test
- Tire condition and alignment check
- Brake wear inspection
- Exterior lighting review
- Coolant freeze-point check

Let’s make sure your {{vehicle_model}} is ready for colder nights.

📅 **Book your check-up:** {{booking_link}}

See you soon,
{{shop_name}}`,
    is_active: true,
  },
  {
    month_number: 11,
    subject: "🦃 Thanksgiving Travel Prep",
    preview_text: "Free pre-trip checks available before holiday travel",
    holiday_theme: "Thanksgiving",
    seasonal_theme: "Fall/Winter",
    content: `Hi {{first_name}},

Holiday travel is almost here.

🦃 **November Offer: Pre-Trip Peace of Mind**
- Tire and pressure check
- Battery health check
- Fluid top-off
- Light and signal inspection
- Brake quick-test

Travel with confidence and reduce the risk of roadside surprises.

📅 **Reserve your pre-trip slot:** {{booking_link}}

Happy Thanksgiving,
The Team at {{shop_name}}`,
    is_active: true,
  },
  {
    month_number: 12,
    subject: "🎄 Year-End Winter Readiness + Gift Cards",
    preview_text: "Finish the year strong with winter services and holiday gifting",
    holiday_theme: "Christmas / Hanukkah / New Year",
    seasonal_theme: "Winter",
    content: `Hi {{first_name}},

Thank you for trusting {{shop_name}} this year.

🎁 **December Highlights**
- Winter readiness inspection
- Battery and charging-system check
- Antifreeze and heater performance review
- Tire pressure reset for cold weather
- Gift cards available for friends and family

Let’s get your {{vehicle_info}} ready for holiday travel and the new year.

📅 **Book before year-end:** {{booking_link}}

Warm wishes,
The Team at {{shop_name}}`,
    is_active: true,
  },
];

export function NewsletterSequence() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [sequences, setSequences] = useState<NewsletterSequence[]>([]);
  const [templates, setTemplates] = useState<NewsletterTemplate[]>([]);
  const [selectedSequence, setSelectedSequence] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<NewsletterTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<NewsletterTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPersonalized, setShowPersonalized] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newSequenceName, setNewSequenceName] = useState("");
  const [newSequenceDescription, setNewSequenceDescription] = useState("");

  // Function to replace personalization tokens with sample data
  const personalizeContent = (content: string): string => {
    return content
      .replace(/\{\{customer_name\}\}/g, 'John Smith')
      .replace(/\{\{first_name\}\}/g, 'John')
      .replace(/\{\{vehicle_info\}\}/g, '2020 Toyota Camry')
      .replace(/\{\{vehicle_year\}\}/g, '2020')
      .replace(/\{\{vehicle_make\}\}/g, 'Toyota')
      .replace(/\{\{vehicle_model\}\}/g, 'Camry')
      .replace(/\{\{shop_name\}\}/g, 'Elite Auto Service')
      .replace(/\{\{booking_link\}\}/g, 'https://your-shop.servicewriter.xyz/book');
  };



  const loadSequences = useCallback(async () => {
    try {
      const data = await fetchNewsletterSequences(userId);
      setSequences(data || []);
      if (data && data.length > 0 && !selectedSequence) {
        setSelectedSequence(data[0].id);
      }
    } catch (error) {
      console.error("Error loading sequences:", error);
      toast.error("Failed to load newsletter sequences");
    } finally {
      setLoading(false);
    }
  }, [selectedSequence, userId]);

  const loadTemplates = async (sequenceId: string) => {
    try {
      const data = await fetchNewsletterTemplates(sequenceId);
      setTemplates(data || []);
    } catch (error) {
      console.error("Error loading templates:", error);
    }
  };

  useEffect(() => {
    if (selectedSequence) {
      void Promise.resolve().then(() => loadTemplates(selectedSequence));
    }
  }, [selectedSequence]);

  const loadSubscriberCount = useCallback(async () => {
    try {
      const count = await fetchSubscriberCount(userId);
      setSubscriberCount(count);
    } catch (error) {
      console.error("Error loading subscriber count:", error);
    }
  }, [userId]);

  useEffect(() => {
    if (user) {
      void Promise.resolve().then(() => loadSequences());
      void Promise.resolve().then(() => loadSubscriberCount());
    }
  }, [loadSequences, loadSubscriberCount, user]);

  const createSequenceHandler = async () => {
    if (!newSequenceName.trim()) {
      toast.error("Please enter a sequence name");
      return;
    }

    try {
      const seqId = await createNewsletterSequence(
        user?.id || "",
        newSequenceName,
        newSequenceDescription,
        DEFAULT_TEMPLATES
      );

      toast.success(`✅ Newsletter sequence created with 12 monthly templates!`);
      setCreateDialogOpen(false);
      setNewSequenceName("");
      setNewSequenceDescription("");
      
      await loadSequences();
      setSelectedSequence(seqId);
    } catch (error) {
      console.error("Error creating sequence:", error);
      toast.error("Failed to create newsletter sequence");
    }
  };

  const toggleTemplateActiveHandler = async (template: NewsletterTemplate) => {
    if (!template.id) return;
    try {
      await toggleNewsletterTemplateActive(template.id, !template.is_active);
      toast.success(`${getMonthName(template.month_number)} template ${!template.is_active ? "activated" : "deactivated"}`);
      loadTemplates(selectedSequence!);
    } catch (error) {
      console.error("Error toggling template:", error);
      toast.error("Failed to update template");
    }
  };

  const saveTemplateHandler = async () => {
    if (!editingTemplate || !editingTemplate.id) return;
    try {
      await saveNewsletterTemplate(editingTemplate.id, {
        subject: editingTemplate.subject,
        preview_text: editingTemplate.preview_text,
        content: editingTemplate.content,
        holiday_theme: editingTemplate.holiday_theme,
        seasonal_theme: editingTemplate.seasonal_theme,
      });
      toast.success("Template saved successfully!");
      setEditingTemplate(null);
      loadTemplates(selectedSequence!);
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    }
  };

  const getMonthName = (monthNum: number) => {
    const months = ["January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November", "December"];
    return months[monthNum - 1];
  };

  const getMonthIcon = (monthNum: number) => {
    const icons = [
      Sparkles,    // Jan - New Year
      Heart,       // Feb - Valentine's
      Leaf,        // Mar - Spring
      Sun,         // Apr - Spring/Earth Day
      Flag,        // May - Memorial Day
      Sun,         // Jun - Summer/Father's Day
      PartyPopper, // Jul - 4th of July
      Calendar,    // Aug - Back to School
      Leaf,        // Sep - Fall/Labor Day
      Sparkles,    // Oct - Halloween
      Gift,        // Nov - Thanksgiving
      Snowflake    // Dec - Christmas
    ];
    const IconComponent = icons[monthNum - 1];
    return <IconComponent className="h-4 w-4" />;
  };

  if (loading) {
    return <div className="p-6">Loading newsletter sequences...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Newsletter Sequence Manager</h1>
          <p className="text-muted-foreground mt-1">
            12-month automated newsletter campaign with holiday & seasonal content
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Sequence
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Newsletter Sequence</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Sequence Name</Label>
                <Input
                  placeholder="e.g., 2026 Monthly Newsletter"
                  value={newSequenceName}
                  onChange={(e) => setNewSequenceName(e.target.value)}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  placeholder="Optional description..."
                  value={newSequenceDescription}
                  onChange={(e) => setNewSequenceDescription(e.target.value)}
                />
              </div>
              <Button onClick={createSequenceHandler} className="w-full">
                Create with 12 Templates
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Auto-Enrollment Info Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">📬 Auto-Enrollment Active</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Customers are automatically enrolled when they book appointments. They'll receive the next scheduled newsletter in your active sequence.
              </p>
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline" className="bg-background">
                  <Users className="h-3 w-3 mr-1" />
                  {subscriberCount} Active Subscribers
                </Badge>
                <Badge variant="outline" className="bg-background">
                  <Mail className="h-3 w-3 mr-1" />
                  Auto-adds on booking
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Sequences</p>
                <p className="text-2xl font-bold">{sequences.filter(s => s.is_active).length}</p>
              </div>
              <Calendar className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Subscribers</p>
                <p className="text-2xl font-bold">{subscriberCount}</p>
              </div>
              <Users className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Templates Ready</p>
                <p className="text-2xl font-bold">{templates.filter(t => t.is_active).length}/12</p>
              </div>
              <Mail className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {sequences.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Newsletter Sequences Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first 12-month newsletter sequence with pre-configured holiday templates
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Sequence
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Sequence Selector */}
          <Card>
            <CardHeader>
              <CardTitle>Active Sequence</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                className="w-full p-2 border rounded"
                value={selectedSequence || ""}
                onChange={(e) => setSelectedSequence(e.target.value)}
              >
                {sequences.map(seq => (
                  <option key={seq.id} value={seq.id}>
                    {seq.name} {seq.is_active ? "✓" : "(Inactive)"}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

          {/* Templates Grid */}
          <Card>
            <CardHeader>
              <CardTitle>12 Monthly Email Templates</CardTitle>
              <CardDescription>
                Pre-configured with holidays, seasonal themes, and proven content
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map(template => (
                  <Card key={template.id} className={`${!template.is_active ? 'opacity-60' : ''}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getMonthIcon(template.month_number)}
                          <CardTitle className="text-base">
                            {getMonthName(template.month_number)}
                          </CardTitle>
                        </div>
                        <Switch
                          checked={template.is_active}
                          onCheckedChange={() => toggleTemplateActiveHandler(template)}
                        />
                      </div>
                      <CardDescription>
                        {template.holiday_theme}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <p className="text-sm font-medium truncate">{template.subject}</p>
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          {template.preview_text}
                        </p>
                      </div>
                      
                      <div className="flex gap-2">
                        <Badge variant="outline">{template.seasonal_theme}</Badge>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setSelectedTemplate(template)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Preview
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setEditingTemplate(template)}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>
                {selectedTemplate && `${getMonthName(selectedTemplate.month_number)} Preview`}
              </span>
              <div className="flex items-center gap-2 text-sm font-normal">
                <Label htmlFor="personalize-toggle" className="cursor-pointer">
                  Show Personalized
                </Label>
                <Switch 
                  id="personalize-toggle"
                  checked={showPersonalized}
                  onCheckedChange={setShowPersonalized}
                />
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4">
              {showPersonalized && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Sparkles className="h-3 w-3 text-primary" />
                      Preview showing sample personalization: Customer = John Smith, Vehicle = 2020 Toyota Camry
                    </p>
                  </CardContent>
                </Card>
              )}
              <div>
                <Label>Subject Line</Label>
                <p className="text-sm font-medium mt-1">
                  {showPersonalized ? personalizeContent(selectedTemplate.subject) : selectedTemplate.subject}
                </p>
              </div>
              <div>
                <Label>Preview Text</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {showPersonalized ? personalizeContent(selectedTemplate.preview_text) : selectedTemplate.preview_text}
                </p>
              </div>
              <div>
                <Label>Holiday Theme</Label>
                <Badge className="mt-1">{selectedTemplate.holiday_theme}</Badge>
              </div>
              <div>
                <Label>Email Content</Label>
                <div className="mt-2 p-4 bg-muted rounded whitespace-pre-wrap text-sm">
                  {showPersonalized ? personalizeContent(selectedTemplate.content) : selectedTemplate.content}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate && `Edit ${getMonthName(editingTemplate.month_number)} Template`}
            </DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-4">
              <div>
                <Label>Subject Line</Label>
                <Input
                  value={editingTemplate.subject}
                  onChange={(e) => setEditingTemplate({
                    ...editingTemplate,
                    subject: e.target.value
                  })}
                  maxLength={500}
                />
              </div>
              <div>
                <Label>Preview Text</Label>
                <Input
                  value={editingTemplate.preview_text}
                  onChange={(e) => setEditingTemplate({
                    ...editingTemplate,
                    preview_text: e.target.value
                  })}
                  maxLength={255}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Holiday Theme</Label>
                  <Input
                    value={editingTemplate.holiday_theme}
                    onChange={(e) => setEditingTemplate({
                      ...editingTemplate,
                      holiday_theme: e.target.value
                    })}
                  />
                </div>
                <div>
                  <Label>Seasonal Theme</Label>
                  <Input
                    value={editingTemplate.seasonal_theme}
                    onChange={(e) => setEditingTemplate({
                      ...editingTemplate,
                      seasonal_theme: e.target.value
                    })}
                  />
                </div>
              </div>
              
              {/* Personalization Tokens Guide */}
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">Personalization Tokens</p>
                      <p className="text-xs text-muted-foreground">Copy and paste these into your email content</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {PERSONALIZATION_TOKENS.map((token) => (
                      <div 
                        key={token.token}
                        className="flex items-center justify-between p-2 bg-background rounded border hover:border-primary cursor-pointer"
                        onClick={() => {
                          navigator.clipboard.writeText(token.token);
                          toast.success(`Copied ${token.token}`);
                        }}
                      >
                        <div className="flex-1">
                          <code className="font-mono text-primary">{token.token}</code>
                          <p className="text-muted-foreground mt-0.5">{token.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Click any token to copy. Example: <code className="text-primary">{'{{first_name}}'}</code> becomes "John"
                  </p>
                </CardContent>
              </Card>

              <div>
                <Label>Email Content</Label>
                <Textarea
                  value={editingTemplate.content}
                  onChange={(e) => setEditingTemplate({
                    ...editingTemplate,
                    content: e.target.value
                  })}
                  rows={20}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                  Cancel
                </Button>
                <Button onClick={saveTemplateHandler}>
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
