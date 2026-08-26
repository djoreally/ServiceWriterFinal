import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2, CheckCircle, MessageSquare } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  fetchTestimonialBusinessProfile,
  type TestimonialBusinessProfile,
} from "@/application/queries/testimonial-submit.query";
import { submitTestimonial } from "@/application/commands/testimonial-submit.command";

type BusinessProfile = TestimonialBusinessProfile;

const TestimonialSubmit = () => {
  const { slug } = useParams<{ slug: string }>();
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    content: "",
  });

  useEffect(() => {
    fetchBusinessProfile();
  }, [slug]);

  const fetchBusinessProfile = async () => {
    if (!slug) {
      setLoading(false);
      return;
    }
    const profile = await fetchTestimonialBusinessProfile(slug);
    if (profile) setBusinessProfile(profile);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!businessProfile) {
      toast.error("Business not found");
      return;
    }

    if (!formData.name || !formData.content) {
      toast.error("Please fill in your name and testimonial");
      return;
    }

    setSubmitting(true);
    try {
      await submitTestimonial({
        user_id: businessProfile.user_id,
        customer_name: formData.name,
        customer_email: formData.email || null,
        content: formData.content,
        rating,
      });
      setSubmitted(true);
    } catch {
      toast.error("Failed to submit testimonial. Please try again.");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!businessProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-bold mb-2">Business Not Found</h2>
            <p className="text-muted-foreground">
              The business you're looking for doesn't exist or the link is incorrect.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center space-y-4">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-900/30 rounded-md flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-gray-600" />
            </div>
            <h2 className="text-2xl font-bold">Thank You!</h2>
            <p className="text-muted-foreground">
              Your testimonial has been submitted and is pending review. We appreciate your feedback!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center space-y-4">
          {businessProfile.logo_url && (
            <img
              src={businessProfile.logo_url}
              alt={businessProfile.business_name}
              className="h-16 w-16 object-contain mx-auto rounded-lg"
            />
          )}
          <div>
            <CardTitle className="text-2xl">{businessProfile.business_name}</CardTitle>
            <p className="text-muted-foreground mt-2">
              We'd love to hear about your experience!
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Star Rating */}
            <div className="space-y-2">
              <Label>Your Rating</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-8 w-8 transition-colors ${
                        star <= (hoverRating || rating)
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Your Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Smith"
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@example.com"
              />
              <p className="text-xs text-muted-foreground">
                Your email won't be displayed publicly
              </p>
            </div>

            {/* Testimonial */}
            <div className="space-y-2">
              <Label htmlFor="content">Your Testimonial *</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Tell us about your experience..."
                rows={4}
                required
              />
            </div>

            <Button type="submit" className="w-full gap-2" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4" />
                  Submit Testimonial
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default TestimonialSubmit;
