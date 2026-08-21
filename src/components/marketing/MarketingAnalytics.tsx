import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, MessageSquare, MousePointer, Send, Star, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchMarketingAnalytics, type MarketingAnalyticsResult } from "@/application/queries/marketing.query";

export const MarketingAnalytics = () => {
  const [analytics, setAnalytics] = useState<MarketingAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchMarketingAnalytics()
      .then(setAnalytics)
      .catch((error) => console.error("Failed to load marketing analytics:", error))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex min-h-[300px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!analytics) return null;

  const reviewClickRate = analytics.reviewRequestsSent > 0
    ? Math.round((analytics.reviewRequestsClicked / analytics.reviewRequestsSent) * 100)
    : 0;
  const testimonialApprovalRate = analytics.testimonials > 0
    ? Math.round((analytics.approvedTestimonials / analytics.testimonials) * 100)
    : 0;

  const overview = [
    { label: "Subscribers", value: analytics.subscribers, icon: Users },
    { label: "Emails sent", value: analytics.emailsSent, icon: Mail },
    { label: "Review requests", value: analytics.reviewRequestsSent, icon: Star },
    { label: "Testimonials", value: analytics.approvedTestimonials, icon: MessageSquare },
  ];

  return <div className="space-y-6">
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{overview.map(({ label, value, icon: Icon }) => <Card key={label}><CardContent className="flex items-center gap-3 pt-6"><div className="rounded-lg bg-primary/10 p-2"><Icon className="h-5 w-5 text-primary" /></div><div><p className="text-2xl font-bold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div></CardContent></Card>)}</div>

    <div className="grid gap-4 md:grid-cols-3">
      <Card className="border-dashed"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Email open rate</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">Unavailable</p><p className="mt-1 text-xs text-muted-foreground">Connect provider-measured delivery and open events before reporting this metric.</p></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Review click rate</CardTitle></CardHeader><CardContent><div className="flex items-center gap-2"><span className="text-3xl font-bold">{reviewClickRate}%</span><MousePointer className="h-5 w-5 text-blue-500" /></div><p className="mt-1 text-xs text-muted-foreground">{analytics.reviewRequestsClicked} of {analytics.reviewRequestsSent} clicked</p></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Testimonial approval</CardTitle></CardHeader><CardContent><div className="flex items-center gap-2"><span className="text-3xl font-bold">{testimonialApprovalRate}%</span><Star className="h-5 w-5 text-amber-500" /></div><p className="mt-1 text-xs text-muted-foreground">{analytics.approvedTestimonials} of {analytics.testimonials} approved</p></CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>Email activity by type</CardTitle></CardHeader><CardContent>{analytics.emailQueueStats.length > 0 ? <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.emailQueueStats}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="email_type" tick={{ fontSize: 12 }} angle={-35} textAnchor="end" height={72} /><YAxis /><Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} /><Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="flex h-[240px] items-center justify-center text-center text-muted-foreground"><div><Send className="mx-auto mb-3 h-10 w-10 opacity-50" /><p>No email activity yet</p></div></div>}</CardContent></Card>
  </div>;
};
