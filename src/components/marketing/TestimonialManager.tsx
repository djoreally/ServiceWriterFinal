import { useState, useEffect } from "react";
import useIsClient from "@/hooks/useIsClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageSquare, Star, Check, X, Copy, ExternalLink, Loader2, Video, Quote } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { fetchTestimonials as fetchTestimonialsQuery, fetchBusinessSlug as fetchBusinessSlugQuery, type TestimonialRow } from "@/application/queries/marketing.query";
import { updateTestimonialStatus, toggleTestimonialFeatured } from "@/application/commands/marketing.command";

type Testimonial = TestimonialRow;

export const TestimonialManager = () => {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
  const [businessSlug, setBusinessSlug] = useState<string | null>(null);
  const isClient = useIsClient();

  useEffect(() => {
    fetchTestimonials();
    fetchBusinessSlug();
  }, []);

  const fetchTestimonials = async () => {
    try {
      const data = await fetchTestimonialsQuery();
      setTestimonials(data);
    } catch {
      // silently fail
    }
    setLoading(false);
  };

  const fetchBusinessSlug = async () => {
    const slug = await fetchBusinessSlugQuery();
    if (slug) setBusinessSlug(slug);
  };

  const handleApprove = async (id: string) => {
    try {
      await updateTestimonialStatus(id, "approved");
      toast.success("Testimonial approved");
      fetchTestimonials();
    } catch {
      toast.error("Failed to approve testimonial");
    }
  };

  const handleReject = async (id: string) => {
    try {
      await updateTestimonialStatus(id, "rejected");
      toast.success("Testimonial rejected");
      fetchTestimonials();
    } catch {
      toast.error("Failed to reject testimonial");
    }
  };

  const handleToggleFeatured = async (id: string, featured: boolean) => {
    try {
      await toggleTestimonialFeatured(id, featured);
      toast.success(featured ? "Removed from featured" : "Added to featured");
      fetchTestimonials();
    } catch {
      toast.error("Failed to update testimonial");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-gray-500">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-500">Rejected</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const renderStars = (rating: number | null) => {
    if (!rating) return null;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${star <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
          />
        ))}
      </div>
    );
  };

  const testimonialSubmitUrl = businessSlug
    ? `${isClient ? window.location.origin : ''}/testimonial/${businessSlug}`
    : null;

  const stats = {
    total: testimonials.length,
    pending: testimonials.filter(t => t.status === "pending").length,
    approved: testimonials.filter(t => t.status === "approved").length,
    featured: testimonials.filter(t => t.featured).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Quote className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-sm text-muted-foreground">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-900/30 rounded-lg">
                <Check className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.approved}</p>
                <p className="text-sm text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Star className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.featured}</p>
                <p className="text-sm text-muted-foreground">Featured</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Share Link */}
      {testimonialSubmitUrl && (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h4 className="font-medium">Collect Testimonials</h4>
                <p className="text-sm text-muted-foreground">
                  Share this link with customers to collect testimonials
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-background px-3 py-2 rounded-md text-sm font-mono border">
                  {testimonialSubmitUrl}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard && testimonialSubmitUrl) {
                      navigator.clipboard.writeText(testimonialSubmitUrl);
                      toast.success("Link copied!");
                    } else {
                      toast.error("Clipboard not available");
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { if (typeof window !== 'undefined' && testimonialSubmitUrl) window.open(testimonialSubmitUrl, "_blank"); }}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Testimonials List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Customer Testimonials</CardTitle>
          <Dialog open={embedDialogOpen} onOpenChange={setEmbedDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Copy className="h-4 w-4" />
                Get Embed Code
              </Button>
            </DialogTrigger>
            <DialogContent aria-describedby="embed-testimonials-description">
              <DialogHeader>
                <DialogTitle>Embed Testimonials on Your Website</DialogTitle>
              </DialogHeader>
              <p id="embed-testimonials-description" className="text-sm text-muted-foreground sr-only">Copy the embed code to display testimonials on your website.</p>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Copy this code and paste it into your website to display your approved testimonials:
                </p>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
{`<!-- Testimonials Widget -->
<div id="testimonials-widget" 
     data-business="${businessSlug || "your-business"}">
</div>
<script src="${isClient ? window.location.origin : ''}/testimonials-widget.js"></script>`}
                </pre>
                <Button
                  onClick={() => {
                    const embed = `<div id="testimonials-widget" data-business="${businessSlug || "your-business"}"></div><script src="${isClient ? window.location.origin : ''}/testimonials-widget.js"></script>`;
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(embed);
                      toast.success("Embed code copied!");
                    } else {
                      toast.error("Clipboard not available");
                    }
                  }}
                  className="w-full gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Copy Embed Code
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {testimonials.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No testimonials yet.</p>
              <p className="text-sm">Share your testimonial link with customers to start collecting!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {testimonials.map((testimonial) => (
                <div
                  key={testimonial.id}
                  className="p-4 border rounded-lg space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{testimonial.customer_name}</h4>
                        {getStatusBadge(testimonial.status)}
                        {testimonial.featured && (
                          <Badge className="bg-purple-500">Featured</Badge>
                        )}
                        {testimonial.video_url && (
                          <Badge variant="outline" className="gap-1">
                            <Video className="h-3 w-3" />
                            Video
                          </Badge>
                        )}
                      </div>
                      {renderStars(testimonial.rating)}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(testimonial.created_at), "PP")}
                    </span>
                  </div>

                  {testimonial.content && (
                    <blockquote className="text-sm text-muted-foreground italic border-l-2 pl-4">
                      "{testimonial.content}"
                    </blockquote>
                  )}

                  {testimonial.video_url && (
                    <div>
                      <Button variant="outline" size="sm" asChild>
                        <a href={testimonial.video_url} target="_blank" rel="noopener noreferrer">
                          <Video className="h-4 w-4 mr-2" />
                          View Video
                        </a>
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    {testimonial.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleApprove(testimonial.id)}
                          className="gap-1"
                        >
                          <Check className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(testimonial.id)}
                          className="gap-1"
                        >
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                      </>
                    )}
                    {testimonial.status === "approved" && (
                      <Button
                        size="sm"
                        variant={testimonial.featured ? "default" : "outline"}
                        onClick={() => handleToggleFeatured(testimonial.id, testimonial.featured)}
                        className="gap-1"
                      >
                        <Star className={`h-4 w-4 ${testimonial.featured ? "fill-current" : ""}`} />
                        {testimonial.featured ? "Unfeature" : "Feature"}
                      </Button>
                    )}
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
