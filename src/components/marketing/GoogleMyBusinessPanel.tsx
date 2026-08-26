import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Building2, Star, MapPin, MessageSquare, Phone, ExternalLink, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  GOOGLE_INSIGHTS_REDIRECT_PATH,
  fetchGbpOverview,
  fetchGbpPerformance,
  fetchGbpReviews,
  fetchGoogleInsightsResources,
  fetchGoogleInsightsStatus,
  replyToGbpReview,
  selectGoogleInsightsResources,
  startGoogleInsightsOAuth,
  type GoogleBusinessOverview,
  type GoogleBusinessPerformance,
  type GoogleBusinessReview,
  type GoogleInsightsResources,
} from "@/application/commands/google-insights";

const STAR_VALUE: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((index) => (
        <Star
          key={index}
          className={`h-3.5 w-3.5 ${index <= rating ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"}`}
        />
      ))}
    </span>
  );
}

export const GoogleMyBusinessPanel = () => {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [locationSelected, setLocationSelected] = useState(false);
  const [overview, setOverview] = useState<GoogleBusinessOverview | null>(null);
  const [performance, setPerformance] = useState<GoogleBusinessPerformance | null>(null);
  const [reviews, setReviews] = useState<GoogleBusinessReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [resources, setResources] = useState<GoogleInsightsResources | null>(null);
  const [analyticsPropertyId, setAnalyticsPropertyId] = useState<string | null>(null);
  const [pendingLocationId, setPendingLocationId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await fetchGoogleInsightsStatus();
      setConnected(status.connected);
      const hasLocation = Boolean(status.business_location_id);
      setLocationSelected(hasLocation);
      setAnalyticsPropertyId(status.analytics_property_id ?? null);
      if (!status.connected) return;

      if (!hasLocation) {
        // Load the picker + surface any Google discovery failure verbatim.
        try {
          const discovered = await fetchGoogleInsightsResources();
          setResources(discovered);
          const firstError = discovered.errors ? Object.values(discovered.errors)[0] : null;
          if (firstError && discovered.locations.length === 0) setError(`Google says: ${firstError}`);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Unable to list Business Profile locations");
        }
        return;
      }

      const [overviewResult, performanceResult, reviewsResult] = await Promise.allSettled([
        fetchGbpOverview(),
        fetchGbpPerformance(30),
        fetchGbpReviews(),
      ]);
      if (overviewResult.status === "fulfilled") setOverview(overviewResult.value);
      if (performanceResult.status === "fulfilled") setPerformance(performanceResult.value);
      if (reviewsResult.status === "fulfilled") setReviews(reviewsResult.value.reviews);

      const failure = [overviewResult, performanceResult, reviewsResult].find((item) => item.status === "rejected");
      if (failure && failure.status === "rejected") {
        setError(failure.reason instanceof Error ? failure.reason.message : String(failure.reason));
      }
    } catch (caught) {
      setConnected(false);
      setError(caught instanceof Error ? caught.message : "Unable to load Google Business Profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    setWorking(true);
    try {
      const data = await startGoogleInsightsOAuth(window.location.origin + GOOGLE_INSIGHTS_REDIRECT_PATH);
      sessionStorage.setItem("google_oauth_integration", "insights");
      sessionStorage.setItem("google_oauth_return_to", window.location.pathname);
      window.location.href = data.url;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to connect Google Business Profile");
      setWorking(false);
    }
  };

  const saveLocation = async () => {
    if (!pendingLocationId) return;
    setWorking(true);
    try {
      await selectGoogleInsightsResources(analyticsPropertyId, pendingLocationId);
      toast.success("Business Profile location saved");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to save location");
    } finally {
      setWorking(false);
    }
  };

  const submitReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    setWorking(true);
    try {
      await replyToGbpReview(reviewId, replyText.trim());
      toast.success("Reply posted to Google");
      setReplyingTo(null);
      setReplyText("");
      const refreshed = await fetchGbpReviews();
      setReviews(refreshed.reviews);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to post reply");
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Google My Business
          </CardTitle>
          <CardDescription>
            Connect your Google Business Profile to monitor reviews, local search performance, and profile details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Badge variant="secondary">Status: Not connected</Badge>
          <Button type="button" className="gap-2" onClick={connect} disabled={working}>
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Connect Google Business Profile
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Google My Business
            </CardTitle>
            <CardDescription>
              {overview?.location_name || "Google Business Profile connected"}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">Connected</Badge>
            <Badge variant="outline">Local SEO</Badge>
          </div>
          {!locationSelected && (
            <div className="space-y-3 rounded-md border border-destructive/20 bg-destructive/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-destructive">
                  No Business Profile location is selected yet. Pick the listing you want to monitor.
                </p>
              </div>
              {resources && resources.locations.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-9 min-w-[220px] rounded-md border bg-background px-2 text-sm"
                    value={pendingLocationId}
                    onChange={(event) => setPendingLocationId(event.target.value)}
                  >
                    <option value="">Select a location…</option>
                    {resources.locations.map((location) => (
                      <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                  </select>
                  <Button size="sm" onClick={() => void saveLocation()} disabled={working || !pendingLocationId}>
                    Save location
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  {resources?.errors && Object.entries(resources.errors).map(([source, message]) => (
                    <p key={source} className="text-xs text-destructive">
                      <span className="font-semibold capitalize">{source}</span> — Google says: {message}
                    </p>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => void load()} disabled={working}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry listing
                  </Button>
                </div>
              )}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Rating</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Star className="h-5 w-5 fill-yellow-500 text-yellow-500" />
              {overview?.averageRating != null ? overview.averageRating.toFixed(1) : "--"}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Reviews</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <MessageSquare className="h-5 w-5 text-primary" />
              {overview?.totalReviewCount ?? "--"}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Profile Views (30d)</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <MapPin className="h-5 w-5 text-primary" />
              {performance ? performance.impressions.toLocaleString() : "--"}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Calls & Clicks (30d)</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Phone className="h-5 w-5 text-primary" />
              {performance ? (performance.callClicks + performance.websiteClicks).toLocaleString() : "--"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent reviews</CardTitle>
          <CardDescription>Reply directly from here — replies post to your Google profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reviews.length === 0 && (
            <p className="text-sm text-muted-foreground">No reviews returned for this location yet.</p>
          )}
          {reviews.map((review, index) => {
            const rating = STAR_VALUE[review.starRating || ""] || 0;
            return (
              <div key={review.reviewId}>
                {index > 0 && <Separator className="mb-4" />}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{review.reviewer?.displayName || "Google user"}</span>
                      <Stars rating={rating} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {review.updateTime ? new Date(review.updateTime).toLocaleDateString() : ""}
                    </span>
                  </div>
                  {review.comment && <p className="text-sm text-muted-foreground">{review.comment}</p>}

                  {review.reviewReply?.comment ? (
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-medium">Your reply</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{review.reviewReply.comment}</p>
                    </div>
                  ) : replyingTo === review.reviewId ? (
                    <div className="space-y-2">
                      <Textarea
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        placeholder="Write a professional reply…"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={working || !replyText.trim()} onClick={() => void submitReply(review.reviewId)}>
                          {working && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                          Post reply
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setReplyingTo(null); setReplyText(""); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setReplyingTo(review.reviewId); setReplyText(""); }}>
                      Reply
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};
