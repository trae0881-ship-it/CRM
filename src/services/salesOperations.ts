import { supabase } from "../lib/supabase";
import type { LeadRecord } from "../types/database";

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

export type PipelineStageRecord = { id: string; pipeline_id: string; name: string; position: number; category: "open" | "won" | "lost"; requires_reason: boolean };

export async function listPipelineStages(organizationId: string) {
  const { data, error } = await client().from("pipeline_stages").select("id,pipeline_id,name,position,category,requires_reason,sales_pipelines!inner(organization_id)").eq("sales_pipelines.organization_id", organizationId).order("position");
  if (error) throw error;
  return (data ?? []) as PipelineStageRecord[];
}

export async function moveLeadToPipelineStage(input: {
  leadId: string;
  stageId: string;
  expectedUpdatedAt: string;
  lostReason?: string;
  expectedDealValue?: number | null;
  expectedCloseDate?: string | null;
}) {
  const { data, error } = await client().rpc("move_lead_to_pipeline_stage", {
    target_lead: input.leadId,
    target_stage: input.stageId,
    expected_updated_at: input.expectedUpdatedAt,
    target_lost_reason: input.lostReason || null,
    target_expected_deal_value: input.expectedDealValue ?? null,
    target_expected_close_date: input.expectedCloseDate ?? null,
  }).single();
  if (error) throw error;
  return data as { lead_id: string; pipeline_stage_id: string; updated_at: string };
}

export async function listCustomerLeads(organizationId: string, search = "") {
  let query = client().from("leads").select("*").eq("organization_id", organizationId).is("deleted_at", null).order("created_at", { ascending: false });
  if (search.trim()) query = query.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LeadRecord[];
}
