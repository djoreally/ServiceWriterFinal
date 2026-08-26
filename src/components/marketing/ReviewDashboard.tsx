import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, ExternalLink, RefreshCw, Loader2, Send, CheckCircle, Clock, MousePointer, BarChart2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { fetchReviewDashboardData, type ReviewRequestRow, type ReviewAnalyticsData } from "@/application/queries/marketing.query";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";


type ReviewRequest = ReviewRequestRow;
type AnalyticsData = ReviewAnalyticsData;

const chartConfig = {
  sent: {
    label: "Sent Requests",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

export const ReviewDashboard = () => {
  const [reviewRequests, setReviewRequests] = useState<ReviewRequest[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { analytics: analyticsData, requests } = await fetchReviewDashboardData();
      setAnalytics(analyticsData);
      setReviewRequests(requests);
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch review data.");
    }
    setLoading(false);
  };

  const getStatusBadge = (request: ReviewRequest) => {
    if (request.clicked_at) {
      return <Badge className="bg-gray-500">Clicked</Badge>;
    }
    if (request.status === "sent") {
      return <Badge className="bg-blue-500">Sent</Badge>;
    }
    return <Badge variant="outline">Pending</Badge>;
  };
  
  const chartData = analytics?.daily_trend.map((d) => ({
    date: format(new Date(d.date), "MMM dd"),
    sent: d.sent,
  })) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Analytics Section */}
      <Card>
        <CardHeader>
          <CardTitle>Review Request Analytics (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Sent</p>
              <p className="text-2xl font-bold">{analytics?.total_requests_sent ?? 0}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Clicked</p>
              <p className="text-2xl font-bold">{analytics?.total_requests_clicked ?? 0}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Click-Through Rate</p>
              <p className="text-2xl font-bold">{analytics?.click_through_rate?.toFixed(1) ?? 0}%</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">By Platform</p>
              <div className="flex items-center gap-2 mt-1">
                {analytics?.requests_by_platform?.map(p => (
                  <Badge key={p.platform} variant="outline">{p.platform}: {p.count}</Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="h-64">
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="sent" name="Sent Requests" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      {/* Review Requests List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Review Requests</CardTitle>
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {reviewRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Star className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No review requests yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviewRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between p-4 border rounded-lg">
                   <div className="space-y-1">
                     <div className="flex items-center gap-2">
                       <h4 className="font-medium">{request.recipient_name || request.recipient_email}</h4>
                       {getStatusBadge(request)}
                       <Badge variant="outline" className="capitalize">{request.platform}</Badge>
                     </div>
                     <p className="text-sm text-muted-foreground">
                       {request.services?.service_type || "Service completed"}
                     </p>
                     <div className="flex items-center gap-4 text-xs text-muted-foreground">
                       <span className="flex items-center gap-1">
                         <Clock className="h-3 w-3" />
                         Created {format(new Date(request.created_at), "PP")}
                       </span>
                      {request.sent_at && (
                        <span className="flex items-center gap-1">
                          <Send className="h-3 w-3" />
                          Sent {format(new Date(request.sent_at), "PP")}
                        </span>
                      )}
                     </div>
                   </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};