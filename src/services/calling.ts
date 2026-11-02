import { supabase } from "../lib/supabase";

const requireClient = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

export async function saveCall(input: {
  organizationId: string;
  leadId: string;
  agentId: string;
  outcome: string;
  notes: string;
  followUpAt: string | null;
  startedAt: string;
  connectedAt: string | null;
  endedAt: string;
  callStatus: "connected" | "disconnected" | "failed";
}) {
  if (!input.outcome.trim()) throw new Error("Call outcome is required.");
  if (["callback", "follow_up"].includes(input.outcome) && !input.followUpAt) throw new Error("A next follow-up is required for this outcome.");
  const { data, error } = await requireClient().from("calls").insert({
    organization_id: input.organizationId,
    lead_id: input.leadId,
    agent_id: input.agentId,
    outcome: input.outcome,
    notes: input.notes || null,
    next_follow_up_at: input.followUpAt,
    call_status: input.callStatus,
    started_at: input.startedAt,
    connected_at: input.connectedAt,
    ended_at: input.endedAt,
    duration_seconds: Math.max(0, Math.round((new Date(input.endedAt).getTime() - new Date(input.startedAt).getTime()) / 1000)),
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function skipLead(leadId: string, reason: string, notes: string, followUpAt: string | null) {
  const { data, error } = await requireClient().rpc("record_lead_skip", { target_lead: leadId, skip_reason: reason, skip_notes: notes, follow_up_at: followUpAt });
  if (error) throw error;
  return data as string;
}
