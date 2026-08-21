import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import type { MarketplaceReview } from "@/application/queries/marketplace-provider.query";

interface Props {
  reviews: MarketplaceReview[];
  onReply: (reviewId: string, reply: string) => Promise<void>;
}

export function MarketplaceReviews({ reviews, onReply }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const rated = reviews.filter((r) => r.rating != null);
  const average = rated.length
    ? rated.reduce((sum, r) => sum + Number(r.rating), 0) / rated.length
    : 0;

  const submit = async (id: string) => {
    setSaving(true);
    try {
      await onReply(id, draft.trim());
      setOpenId(null);
      setDraft("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <div className="rounded-xl bg-primary/10 p-3">
            <Star className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-3xl font-bold text-foreground">{average ? average.toFixed(1) : "—"}</p>
            <p className="text-sm text-muted-foreground">
              {rated.length} rating{rated.length === 1 ? "" : "s"} from customers
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer reviews</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {reviews.length === 0 && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
          {reviews.map((review) => (
            <div key={review.id} className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-foreground">{review.customer_name || "Customer"}</p>
                {review.rating != null && <Badge variant="secondary">{review.rating}/5</Badge>}
                <span className="text-xs text-muted-foreground">
                  {new Date(review.created_at).toLocaleDateString()}
                </span>
              </div>
              {review.content && <p className="text-sm text-muted-foreground">{review.content}</p>}

              {review.provider_reply ? (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs font-medium text-foreground">Your reply</p>
                  <p className="text-sm text-muted-foreground">{review.provider_reply}</p>
                </div>
              ) : openId === review.id ? (
                <div className="space-y-2">
                  <Textarea
                    rows={3}
                    value={draft}
                    placeholder="Thanks for choosing us…"
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={saving || !draft.trim()} onClick={() => submit(review.id)}>
                      {saving ? "Posting…" : "Post reply"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOpenId(review.id);
                    setDraft("");
                  }}
                >
                  Reply
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
