import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { ApiClientError } from "@/lib/api-client";
import {
  AGENT_SCOPE_OPTIONS,
  ALL_AGENT_SCOPES,
  READ_ONLY_AGENT_SCOPES,
  deriveKeyStatus,
  displayKeyPrefix,
  scopeLabel,
  validateAgentKeyForm,
  type AgentApiKeyRecord,
  type CreatedAgentApiKey,
} from "@/lib/agentApiKeys";
import { fetchAgentApiKeys } from "@/application/queries/agent-keys.query";
import { createAgentApiKey, revokeAgentApiKey } from "@/application/commands/agent-keys.command";
import { useTeamRole } from "@/hooks/useTeamRole";
import { CopyField } from "@/components/integrations/McpConnectPanel";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function statusBadge(key: AgentApiKeyRecord) {
  const status = deriveKeyStatus(key);
  if (status === "revoked")
    return (
      <Badge variant="secondary" className="rounded-md bg-muted text-muted-foreground">
        Revoked
      </Badge>
    );
  if (status === "expired")
    return (
      <Badge variant="secondary" className="rounded-md bg-amber-500/10 text-amber-700">
        Expired
      </Badge>
    );
  return (
    <Badge variant="secondary" className="rounded-md bg-emerald-500/10 text-emerald-700">
      Active
    </Badge>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ApiKeysPanel() {
  const { role, loading: roleLoading } = useTeamRole();
  const knownNonAdmin = !roleLoading && role !== null && role !== "owner" && role !== "admin";

  const [keys, setKeys] = useState<AgentApiKeyRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [integrator, setIntegrator] = useState("");
  const [scopes, setScopes] = useState<string[]>([...READ_ONLY_AGENT_SCOPES]);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedAgentApiKey | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<AgentApiKeyRecord | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadKeys = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchAgentApiKeys();
      setKeys(result.keys);
    } catch (error) {
      setKeys(null);
      setLoadError(errorMessage(error, "Could not load API keys."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Non-admins get the notice card instead of the list, so there is
    // nothing to load for them (the server would refuse the read anyway).
    if (knownNonAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchAgentApiKeys();
        if (!cancelled) setKeys(result.keys);
      } catch (error) {
        if (!cancelled) {
          setKeys(null);
          setLoadError(errorMessage(error, "Could not load API keys."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [knownNonAdmin]);

  const toggleScope = (value: string, checked: boolean) => {
    setScopes((current) =>
      checked ? [...current, value] : current.filter((scope) => scope !== value),
    );
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateAgentKeyForm({ name, integrator, scopes });
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    setCreating(true);
    try {
      const created = await createAgentApiKey({ name, integrator, scopes });
      const { raw_key: _rawKey, ...record } = created;
      setKeys((current) => [record, ...(current ?? [])]);
      setCreatedKey(created);
      setName("");
      setIntegrator("");
      toast.success("API key generated — copy it now, it won't be shown again.");
    } catch (error) {
      setFormError(errorMessage(error, "Could not generate the key."));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const updated = await revokeAgentApiKey(revokeTarget.id);
      setKeys((current) => (current ?? []).map((key) => (key.id === updated.id ? updated : key)));
      toast.success(`Key “${updated.name}” revoked.`);
      setRevokeTarget(null);
    } catch (error) {
      toast.error(errorMessage(error, "Could not revoke the key."));
    } finally {
      setRevoking(false);
    }
  };

  if (knownNonAdmin) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Only workspace owners and administrators can manage API keys. Ask an admin to generate or revoke keys for
          this workspace.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {createdKey && (
        <Alert>
          <KeyRound className="h-4 w-4" />
          <AlertTitle>Copy your new API key now</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              This is the only time the full key is shown. Only a hash of it is stored, so it can't be recovered
              later — if you lose it, revoke this key and generate a new one.
            </p>
            <CopyField value={createdKey.raw_key} label="New API key" />
            <div className="flex justify-end">
              <Button type="button" className="rounded-md" onClick={() => setCreatedKey(null)}>
                I've saved it — done
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              API keys
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-md gap-2 shrink-0"
              onClick={() => void loadKeys()}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            Keys belong to the workspace you're viewing. A key only ever sees this workspace, and only the scopes it
            was granted — the workspace comes from the key, never from the caller.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading keys…</p>
          ) : loadError ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button type="button" variant="outline" className="rounded-md" onClick={() => void loadKeys()}>
                Try again
              </Button>
            </div>
          ) : keys && keys.length === 0 ? (
            <div className="rounded-md border p-6 text-center">
              <p className="font-medium">No API keys yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Generate one below to let an assistant or integration work in this workspace.
              </p>
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {(keys ?? []).map((key) => {
                const status = deriveKeyStatus(key);
                return (
                  <li key={key.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{key.name}</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {displayKeyPrefix(key.key_prefix)}
                        </code>
                      </div>
                      <p className="text-sm text-muted-foreground">For {key.integrator}</p>
                      <div className="flex flex-wrap gap-1">
                        {key.scopes.map((scope) => (
                          <Badge key={scope} variant="secondary" className="rounded-md" title={scope}>
                            {scopeLabel(scope)}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Created {formatDate(key.created_at)} · Last used{" "}
                        {key.last_used_at ? formatDateTime(key.last_used_at) : "Never"}
                        {key.expires_at ? ` · Expires ${formatDate(key.expires_at)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                      {statusBadge(key)}
                      {status === "active" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-md text-destructive"
                          onClick={() => setRevokeTarget(key)}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Generate a key
          </CardTitle>
          <CardDescription>
            The full key is shown exactly once, right after you generate it. Grant only the scopes the integration
            actually needs — a key's scopes can't be changed later; revoke and re-issue instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="api-key-name">Name</Label>
                <Input
                  id="api-key-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Front-desk agent"
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-key-integrator">Who or what is this key for?</Label>
                <Input
                  id="api-key-integrator"
                  value={integrator}
                  onChange={(event) => setIntegrator(event.target.value)}
                  placeholder="e.g. Astro, or the booking widget"
                  maxLength={120}
                />
                <p className="text-xs text-muted-foreground">
                  This name is stamped on everything the key does, so its work is attributable.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Scopes</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-md"
                    onClick={() => setScopes([...READ_ONLY_AGENT_SCOPES])}
                  >
                    Read only
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-md"
                    onClick={() => setScopes([...ALL_AGENT_SCOPES])}
                  >
                    Full agent access
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-md"
                    onClick={() => setScopes([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {AGENT_SCOPE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    htmlFor={`scope-${option.value}`}
                    className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
                  >
                    <Checkbox
                      id={`scope-${option.value}`}
                      checked={scopes.includes(option.value)}
                      onCheckedChange={(checked) => toggleScope(option.value, checked === true)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <div className="flex justify-end">
              <Button type="submit" className="rounded-md gap-2" disabled={creating || loading}>
                <KeyRound className="h-4 w-4" />
                {creating ? "Generating…" : "Generate key"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent className="rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this API key?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget
                ? `“${revokeTarget.name}” (${displayKeyPrefix(revokeTarget.key_prefix)}), issued for ${revokeTarget.integrator}, stops working immediately. Anything using it loses access, and this can't be undone — a replacement needs a new key.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md" disabled={revoking}>
              Keep key
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleRevoke();
              }}
              disabled={revoking}
            >
              {revoking ? "Revoking…" : "Revoke key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ApiKeysPanel;
