/**
 * Receptionist.tsx — AI Phone Receptionist provisioning + management.
 * Refactored to completely disable telephony search and purchase after decommission.
 */
import { useEffect, useMemo, useState } from "react";
import { fetchReceptionistProfile, type ReceptionistProfile } from "@/application/queries/receptionist.query";
import {
  updateReceptionistConfig,
  deprovisionReceptionist,
  checkReceptionistHealth,
} from "@/application/commands/receptionist.command";

import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Loader2, Phone, PhoneCall, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AppLayout } from "@/components/layout/AppLayout";

type Profile = ReceptionistProfile;

const VOICES = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah — warm, friendly" },
  { id: "9BWtsMINqrJLrRacOk9x", name: "Aria — energetic" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger — confident" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George — calm" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam — professional" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica — upbeat" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura — bright" },
];

const DEFAULT_PROMPT = `You are a friendly virtual receptionist for an auto service shop.
- Greet callers warmly, keep replies short.
- Collect name, vehicle (year/make/model or fleet unit), service need, and preferred date/time.
- Save a service request for dispatch review. Never promise that a requested date or time is confirmed.
- If unsure, offer to take a message.`;

export default function Receptionist() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  // config state
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [firstMessage, setFirstMessage] = useState("Thanks for calling! How can I help you today?");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);

  const [saving, setSaving] = useState(false);
  const [deprovisioning, setDeprovisioning] = useState(false);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof checkReceptionistHealth>> | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const isProvisioned = !!profile?.receptionist_phone_number_id;

  const loadProfile = async () => {
    setLoading(true);
    const data = await fetchReceptionistProfile();
    setProfile(data);
    if (data?.receptionist_voice_id) setVoiceId(data.receptionist_voice_id);
    if (data?.receptionist_first_message) setFirstMessage(data.receptionist_first_message);
    if (data?.receptionist_system_prompt) setSystemPrompt(data.receptionist_system_prompt);
    setLoading(false);
  };

  const runHealthCheck = async () => {
    setCheckingHealth(true);
    try { setHealth(await checkReceptionistHealth()); }
    catch { setHealth({ healthy: false, state: "check_failed" }); }
    finally { setCheckingHealth(false); }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => { if (isProvisioned) void runHealthCheck(); }, [isProvisioned]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await updateReceptionistConfig({ voiceId, firstMessage, systemPrompt });
      toast({ title: "Saved", description: "Receptionist updated." });
      await loadProfile();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!confirm("Release the number and delete the AI agent? This cannot be undone.")) return;
    setDeprovisioning(true);
    try {
      await deprovisionReceptionist();
      toast({ title: "Receptionist deactivated" });
      await loadProfile();
    } catch (e: any) {
      toast({ title: "Deactivate failed", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setDeprovisioning(false);
    }
  };

  const prettyNumber = useMemo(() => {
    const n = profile?.receptionist_phone_number;
    if (!n) return null;
    const m = n.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
    return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n;
  }, [profile?.receptionist_phone_number]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AppLayout title="AI Receptionist">
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2"><PhoneCall className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-semibold">AI Receptionist</h1>
          <p className="text-sm text-muted-foreground">
            Always-on phone line that books appointments and answers questions for your shop.
          </p>
        </div>
      </div>

      {isProvisioned ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-primary" />
                    {prettyNumber}
                  </CardTitle>
                  <CardDescription>Live receptionist line · powered by ElevenLabs</CardDescription>
                </div>
                <div className="flex items-center gap-2"><Badge variant={health?.healthy ? "default" : "destructive"} className={health?.healthy ? "bg-green-600" : ""}>{checkingHealth ? "Checking…" : health?.healthy ? "Ready" : "Needs check"}</Badge><Button size="sm" variant="outline" onClick={runHealthCheck} disabled={checkingHealth}>Test wiring</Button></div>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>Call this number from any phone and the AI receptionist will answer instantly.</p>
              <p className="mt-2 text-xs">Agent ID: <code className="text-foreground">{profile?.elevenlabs_agent_id}</code></p>
              {health && !health.healthy && <p className="mt-3 rounded-md bg-destructive/10 p-3 text-xs text-destructive">Receptionist integration needs attention. Agent: {health.checks?.agent ? "connected" : "missing"}; phone: {health.checks?.phone ? "bound" : "not bound"}; dispatch tool: {health.checks?.tool ? "installed" : "missing"}. Save the configuration to reinstall the dispatch tool, then test again.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Voice &amp; Behavior</CardTitle>
              <CardDescription>Update what the AI says and how it sounds.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ConfigEditor
                voiceId={voiceId} setVoiceId={setVoiceId}
                firstMessage={firstMessage} setFirstMessage={setFirstMessage}
                systemPrompt={systemPrompt} setSystemPrompt={setSystemPrompt}
              />
              <div className="flex justify-between pt-2">
                <Button variant="destructive" onClick={deactivate} disabled={deprovisioning}>
                  {deprovisioning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Deactivate &amp; Release Number
                </Button>
                <Button onClick={saveConfig} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Alert variant="destructive" className="border border-destructive/20 bg-destructive/5">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="text-base font-semibold">Service Temporarily Unavailable</AlertTitle>
          <AlertDescription className="mt-2 text-sm text-muted-foreground">
            Provisioning new phone receptionist lines is currently disabled because telephony carrier services have been permanently decommissioned.
          </AlertDescription>
        </Alert>
      )}
    </div>
    </AppLayout>
  );
}

function ConfigEditor({
  voiceId, setVoiceId, firstMessage, setFirstMessage, systemPrompt, setSystemPrompt,
}: {
  voiceId: string; setVoiceId: (v: string) => void;
  firstMessage: string; setFirstMessage: (v: string) => void;
  systemPrompt: string; setSystemPrompt: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Voice</Label>
        <Select value={voiceId} onValueChange={setVoiceId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {VOICES.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="receptionist-greeting">Greeting (first thing the AI says)</Label>
        <Input id="receptionist-greeting" name="receptionist-greeting" autoComplete="off" value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="receptionist-prompt">System Prompt (what the AI does)</Label>
        <Textarea id="receptionist-prompt" name="receptionist-prompt" autoComplete="off" rows={8} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
      </div>
    </>
  );
}
