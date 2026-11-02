import { supabase } from "../lib/supabase";

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

export type AutomationRule = { id: string; name: string; mode: string; priority: number; is_active: boolean; conditions: Record<string, unknown> };
export type AutomationWorkflow = { id: string; name: string; trigger_type: string; is_active: boolean; conditions: Record<string, unknown>; actions: unknown[] };

export async function listAssignmentRules(organizationId: string) {
  const { data, error } = await client().from("assignment_rules").select("id,name,mode,priority,is_active,conditions").eq("organization_id", organizationId).order("priority");
  if (error) throw error;
  return (data ?? []) as AutomationRule[];
}

export async function saveAssignmentRule(input: { organization_id: string; name: string; mode: string; priority: number; conditions: Record<string, unknown> }) {
  const { data, error } = await client().from("assignment_rules").insert({ ...input, is_active: true }).select("id,name,mode,priority,is_active,conditions").single();
  if (error) throw error;
  return data as AutomationRule;
}

export async function listAutomationWorkflows(organizationId: string) {
  const { data, error } = await client().from("automation_workflows").select("id,name,trigger_type,is_active,conditions,actions").eq("organization_id", organizationId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AutomationWorkflow[];
}

export async function saveAutomationWorkflow(input: { organization_id: string; name: string; trigger_type: string; conditions: Record<string, unknown>; actions: unknown[] }) {
  const { data, error } = await client().from("automation_workflows").insert({ ...input, is_active: false }).select("id,name,trigger_type,is_active,conditions,actions").single();
  if (error) throw error;
  return data as AutomationWorkflow;
}
