import { supabase } from "../lib/supabase";
import type { LeadEvent, LeadRecord, LeadStatus } from "../types/database";

export type CreateLeadInput = Pick<LeadRecord, "full_name"> & Partial<Omit<LeadRecord, "id" | "organization_id" | "created_at" | "updated_at" | "external_id">>;

const requireClient = () => {
  if (!supabase) throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  return supabase;
};

export async function listLeads(search = ""): Promise<LeadRecord[]> {
  const client = requireClient();
  let query = client.from("leads").select("*").is("deleted_at", null).order("created_at", { ascending: false });
  if (search.trim()) query = query.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LeadRecord[];
}

export async function createLead(input: CreateLeadInput): Promise<LeadRecord> {
  const client = requireClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  const { data: membership, error: membershipError } = await client.from("organization_members").select("organization_id").eq("user_id", userData.user.id).eq("is_active", true).limit(1).single();
  if (membershipError) throw membershipError;
  const { data, error } = await client.from("leads").insert({ ...input, organization_id: membership.organization_id }).select("*").single();
  if (error) throw error;
  return data as LeadRecord;
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("leads").update({ status }).eq("external_id", id);
  if (error) throw error;
}

export async function getLeadByExternalId(externalId: string): Promise<LeadRecord> {
  const { data, error } = await requireClient().from("leads").select("*").eq("external_id", externalId).single();
  if (error) throw error;
  return data as LeadRecord;
}

export async function listLeadTimeline(leadId: string): Promise<LeadEvent[]> {
  const { data, error } = await requireClient().from("lead_journey_events").select("*").eq("lead_id", leadId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LeadEvent[];
}

export async function listOrganizationSalespeople(organizationId: string) {
  const { data, error } = await requireClient().from("organization_members").select("user_id,role,profiles(full_name)").eq("organization_id", organizationId).eq("is_active", true).in("role", ["agent", "manager"]);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    user_id: String(row.user_id),
    role: String(row.role),
    profiles: Array.isArray(row.profiles) ? (row.profiles[0] ?? null) as { full_name: string } | null : row.profiles as { full_name: string } | null,
  }));
}

export async function shareLead(leadId: string, userId: string, expiresAt: string | null, reason: string) {
  const { error } = await requireClient().rpc("share_lead", { target_lead: leadId, target_user: userId, share_expires_at: expiresAt, share_reason: reason });
  if (error) throw error;
}

export async function transferLead(leadId: string, userId: string, reason: string) {
  const { error } = await requireClient().rpc("transfer_lead", { target_lead: leadId, target_user: userId, transfer_reason: reason });
  if (error) throw error;
}
