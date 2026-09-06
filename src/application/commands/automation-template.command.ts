/**
 * Automation Template Commands
 * Seed prebuilt automation rules from templates, and run dry-run "test rule" simulations.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import {
  getAutomationTemplateById,
  renderTemplate,
  SAMPLE_PREVIEW_CONTEXT,
  type AutomationTemplate,
  type AutomationTemplateAction,
} from "@/lib/retention/automation-templates";

const db = supabase as any;

export interface SeedAutomationResult {
  ruleId: string;
  ruleName: string;
}

export async function seedAutomationTemplate(
  userId: string,
  templateId: string,
): Promise<SeedAutomationResult> {
  const template: AutomationTemplate | undefined = getAutomationTemplateById(templateId);
  if (!template) throw new Error(`Unknown automation template: ${templateId}`);

  const record = {
    user_id: userId,
    name: template.name,
    is_active: true,
    priority: template.priority,
    trigger_jsonb: { type: template.trigger } as Json,
    actions_jsonb: template.actions as unknown as Json,
    conditions_jsonb: (template.conditions ?? null) as Json | null,
    audience_jsonb: (template.audience ?? null) as Json | null,
    frequency_guard_jsonb: { min_hours_between: template.cooldownHours } as Json,
  };

  const { data, error } = await supabase
    .from("automation_rules")
    .insert(record)
    .select("id, name")
    .single();

  if (error || !data) throw new Error(error?.message || "Failed to seed automation template");
  return { ruleId: data.id, ruleName: data.name };
}

export interface SeedAllDefaultsResult {
  automationRulesInserted: number;
  customerSegmentsInserted: number;
}

export async function seedAllDefaults(userId: string): Promise<SeedAllDefaultsResult> {
  if (!userId?.trim()) throw new Error("Cannot restore defaults before authentication is ready.");

  const { data: automationRulesInserted, error: rulesError } = await db.rpc(
    "seed_default_automation_rules",
    { p_user_id: userId },
  );
  if (rulesError) throw new Error(rulesError.message || "Failed to restore default automation rules");

  const { data: customerSegmentsInserted, error: segmentsError } = await db.rpc(
    "seed_default_customer_segments",
    { p_user_id: userId },
  );
  if (segmentsError) throw new Error(segmentsError.message || "Failed to restore default customer segments");

  return {
    automationRulesInserted: Number(automationRulesInserted || 0),
    customerSegmentsInserted: Number(customerSegmentsInserted || 0),
  };
}

export interface DryRunActionResult {
  type: string;
  status: "would_send" | "skipped" | "error";
  preview: {
    subject?: string;
    body?: string;
    template?: string;
    config?: Record<string, unknown>;
  };
  reason?: string;
}

export interface DryRunRuleResult {
  ruleId: string;
  ruleName: string;
  matchedTrigger: string;
  actionResults: DryRunActionResult[];
}

export async function dryRunAutomationRule(
  userId: string,
  ruleId: string,
  customerId?: string,
): Promise<DryRunRuleResult> {
  const { data: rule, error } = await supabase
    .from("automation_rules")
    .select("id, name, trigger_jsonb, actions_jsonb")
    .eq("id", ruleId)
    .eq("user_id", userId)
    .single();

  if (error || !rule) throw new Error("Rule not found");

  let context: Record<string, string> = { ...SAMPLE_PREVIEW_CONTEXT };
  if (customerId) {
    const workspace = await resolveCurrentWorkspace();
    if (!workspace) throw new Error("No active workspace is available.");
    const { data: cust, error: customerError } = await db
      .from("customers")
      .select("first_name,last_name,company_name,email,phone")
      .eq("workspace_id", workspace.workspaceId)
      .eq("id", customerId)
      .maybeSingle();
    if (customerError) throw customerError;
    if (cust) {
      const fullName = [cust.first_name, cust.last_name].filter(Boolean).join(" ") || cust.company_name || context.customer_name;
      context = {
        ...context,
        customer_name: fullName,
        customer_first_name: cust.first_name || fullName.split(" ")[0] || context.customer_first_name,
      };
    }
  }

  const trigger = (rule.trigger_jsonb as { type?: string } | null)?.type || "unknown";
  const actions = (rule.actions_jsonb as unknown as AutomationTemplateAction[] | null) || [];

  const actionResults: DryRunActionResult[] = actions.map((a) => {
    try {
      const preview: DryRunActionResult["preview"] = {};
      if (a.subject) preview.subject = renderTemplate(a.subject, context);
      if (a.body) preview.body = renderTemplate(a.body, context);
      if (a.template) preview.template = a.template;
      if (a.config) preview.config = a.config;
      return { type: a.type, status: "would_send", preview };
    } catch (e) {
      return {
        type: a.type,
        status: "error",
        preview: {},
        reason: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    matchedTrigger: trigger,
    actionResults,
  };
}
