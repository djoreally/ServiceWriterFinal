import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Download, Loader2, RefreshCw, ShieldAlert, Smartphone, XCircle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useTeamRole } from "@/hooks/useTeamRole";
import {
  listMobileReleases,
  publishMobileRelease,
  recordMobileReleaseInstall,
  revokeMobileRelease,
  type MobileRelease,
  type MobileReleasePlatform,
} from "@/application/commands/mobile-release-distribution.command";
import { currentTimeMs } from "@/lib/datetime";

const initialForm = {
  platform: "android" as MobileReleasePlatform,
  version: "1.0.0",
  buildNumber: "1",
  artifactUrl: "",
  artifactSha256: "",
  releaseNotes: "",
};

export default function FieldCompanion() {
  const { role } = useTeamRole();
  const isManager = role === "admin" || role === "manager";
  const [releases, setReleases] = useState<MobileRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [now] = useState(currentTimeMs);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listMobileReleases(isManager ? "all" : "available");
      setReleases(result.releases);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load mobile releases");
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  useEffect(() => {
    void Promise.resolve().then(() => refresh());
  }, [refresh]);

  const availableReleases = useMemo(
    () => releases.filter((release) => release.status === "published" && (!release.expires_at || new Date(release.expires_at).getTime() > now)),
    [releases, now],
  );

  const downloadRelease = async (release: MobileRelease) => {
    setDownloadingId(release.id);
    try {
      await recordMobileReleaseInstall(release.id);
      window.location.assign(release.artifact_url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The download could not be started");
    } finally {
      setDownloadingId(null);
    }
  };

  const publish = async () => {
    const buildNumber = Number(form.buildNumber);
    if (!form.artifactUrl.trim() || !form.version.trim() || !Number.isInteger(buildNumber) || buildNumber <= 0) {
      toast.error("Enter a version, positive build number, and HTTPS artifact URL");
      return;
    }
    setPublishing(true);
    try {
      await publishMobileRelease({
        platform: form.platform,
        channel: "internal",
        version: form.version.trim(),
        buildNumber,
        artifactUrl: form.artifactUrl.trim(),
        artifactSha256: form.artifactSha256.trim() || undefined,
        releaseNotes: form.releaseNotes.trim() || undefined,
      });
      toast.success("Internal mobile release published");
      setForm(initialForm);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Release could not be published");
    } finally {
      setPublishing(false);
    }
  };

  const revoke = async (release: MobileRelease) => {
    try {
      await revokeMobileRelease(release.id);
      toast.success("Release download revoked");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Release could not be revoked");
    }
  };

  return (
    <AppLayout title="Field Companion">
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Field Companion</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Download the approved Service Writer technician companion for active guidance and assigned-work telemetry. Packages are distributed privately and do not require an app-store listing.
              </p>
            </div>
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Refresh
            </Button>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <div className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p><strong>Install only releases published here.</strong> Android may ask for permission to install from this browser. iOS internal packages require your device to be registered in the distribution provisioning profile before installation.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {loading ? <ReleaseSkeleton /> : availableReleases.length === 0 ? (
            <Card className="md:col-span-2"><CardContent className="p-8 text-center text-sm text-muted-foreground">No active companion release is available for this workspace.</CardContent></Card>
          ) : availableReleases.map((release) => (
            <Card key={release.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base"><Smartphone className="h-4 w-4 text-primary" /> {release.platform === "android" ? "Android APK" : "iOS internal build"}</CardTitle>
                    <CardDescription>Version {release.version} · Build {release.build_number}</CardDescription>
                  </div>
                  <Badge variant="secondary">{release.channel}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {release.release_notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{release.release_notes}</p>}
                <Button className="w-full" onClick={() => void downloadRelease(release)} disabled={downloadingId === release.id}>
                  {downloadingId === release.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Download and install
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>

        {isManager && (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <Card>
              <CardHeader><CardTitle className="text-base">Publish an internal build</CardTitle><CardDescription>Paste the HTTPS artifact URL from the signed EAS build or approved storage location.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="platform">Platform</Label><select id="platform" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.platform} onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value as MobileReleasePlatform }))}><option value="android">Android APK</option><option value="ios">iOS internal</option></select></div>
                  <div className="space-y-1.5"><Label htmlFor="build">Build number</Label><Input id="build" inputMode="numeric" value={form.buildNumber} onChange={(event) => setForm((current) => ({ ...current, buildNumber: event.target.value }))} /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="version">Version</Label><Input id="version" value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} /></div>
                <div className="space-y-1.5"><Label htmlFor="artifact">Signed artifact URL</Label><Input id="artifact" placeholder="https://..." value={form.artifactUrl} onChange={(event) => setForm((current) => ({ ...current, artifactUrl: event.target.value }))} /></div>
                <div className="space-y-1.5"><Label htmlFor="sha">SHA-256 checksum (optional)</Label><Input id="sha" value={form.artifactSha256} onChange={(event) => setForm((current) => ({ ...current, artifactSha256: event.target.value }))} /></div>
                <div className="space-y-1.5"><Label htmlFor="notes">Release notes</Label><Textarea id="notes" value={form.releaseNotes} onChange={(event) => setForm((current) => ({ ...current, releaseNotes: event.target.value }))} /></div>
                <Button onClick={() => void publish()} disabled={publishing}>{publishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Publish release</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Release management</CardTitle><CardDescription>Revoking a release removes its dashboard download link. It does not uninstall an already installed app.</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {releases.length === 0 ? <p className="text-sm text-muted-foreground">No releases published yet.</p> : releases.map((release) => (
                  <div key={release.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0"><p className="text-sm font-medium">{release.platform} · {release.version} ({release.build_number})</p><p className="text-xs text-muted-foreground">{release.status} · {new Date(release.created_at).toLocaleString()}</p></div>
                    {release.status === "published" && <Button size="sm" variant="outline" className="text-destructive" onClick={() => void revoke(release)}><XCircle className="mr-1.5 h-3.5 w-3.5" /> Revoke</Button>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </AppLayout>
  );
}

function ReleaseSkeleton() {
  return <Card className="md:col-span-2"><CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading available releases…</CardContent></Card>;
}
