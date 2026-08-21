/**
 * VoiceAgentSettings — Settings card for configuring ElevenLabs voice agent.
 */
import { useState, useEffect } from "react";
import { Mic, ExternalLink, Save, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { fetchVoiceAgentSettings } from "@/application/queries/voice-agent.query";
import { updateVoiceAgentSettings } from "@/application/commands/voice-agent.command";

export function VoiceAgentSettings() {
  const [agentId, setAgentId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const settings = await fetchVoiceAgentSettings();
      if (settings) {
        setAgentId(settings.agentId ?? "");
        setEnabled(!!settings.agentId);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateVoiceAgentSettings({ enabled, agentId });
      toast.success("Voice agent settings saved");
    } catch {
      toast.error("Failed to save voice agent settings");
    } finally {
      setSaving(false);
    }
  };


  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5" />
          Voice Booking Agent
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Let customers book appointments using voice on your website
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="voice-agent-toggle">Enable Voice Agent</Label>
          <Switch
            id="voice-agent-toggle"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="agent-id">ElevenLabs Agent ID</Label>
              <Input
                id="agent-id"
                placeholder="e.g. abc123def456"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Create an agent at{" "}
                <a
                  href="https://elevenlabs.io/app/conversational-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  ElevenLabs Dashboard
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>
          </>
        )}

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
