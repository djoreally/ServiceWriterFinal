import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, FileText } from "lucide-react";
import {
  searchServicesForLinking,
  type ServiceSummary,
} from "@/application/queries/service-assets.query";
import { useDebounce } from "@/hooks/useDebounce";

interface Props {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: (serviceId: string) => Promise<void> | void;
}

export function AttachToServiceDialog({ open, count, onOpenChange, onConfirm }: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [results, setResults] = useState<ServiceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => setQuery(""));
    void Promise.resolve().then(() => setSelectedId(null));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.resolve().then(() => setLoading(true));
    void Promise.resolve().then(() => searchServicesForLinking(debouncedQuery, 30)
      .then((rows) => {
        if (!cancelled) setResults(rows);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      }));
    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery]);

  const selected = useMemo(
    () => results.find((r) => r.id === selectedId) ?? null,
    [results, selectedId],
  );

  const submit = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await onConfirm(selectedId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Attach {count} {count === 1 ? "asset" : "assets"} to a service record
          </DialogTitle>
          <DialogDescription>
            Files will appear on the customer's service history.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by service #, type, or description…"
            className="pl-8"
            autoFocus
          />
        </div>

        <ScrollArea className="h-72 rounded-md border">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No service records found.
            </div>
          ) : (
            <ul className="divide-y">
              {results.map((r) => {
                const active = r.id === selectedId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                        active ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <FileText
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          active ? "text-primary" : "text-muted-foreground"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {r.service_number ? `#${r.service_number} · ` : ""}
                          {r.service_type}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.customer_name ?? "No customer"} ·{" "}
                          {new Date(r.service_date).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!selected || saving}>
            {saving ? "Attaching…" : "Attach"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
