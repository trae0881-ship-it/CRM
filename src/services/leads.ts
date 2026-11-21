import { supabase } from "../lib/supabase";
import { buildLeadSearchFilter } from "../lib/leadSearch.mjs";
import { normalizeEmail, normalizePhone } from "../lib/googleSheetsSync";
import type { LeadEvent, LeadRecord, LeadStatus } from "../types/database";
import type { LeadCsvRecord } from "../lib/leadCsvImport";

export type CreateLeadInput = Pick<LeadRecord, "full_name"> & Partial<Omit<LeadRecord, "id" | "organization_id" | "created_at" | "updated_at" | "external_id">>;
export type LeadPage = { records: LeadRecord[]; totalCount: number | null };
export type LeadTrendPoint = { activity_date: string; new_leads: number; cumulative_leads: number; status_counts: Record<string, number> };
export type DuplicateLeadPreview = { id: string; external_id: string; full_name: string; phone: string | null; email: string | null; source: string };
export type DuplicateLeadSummary = { duplicateCount: number; leads: DuplicateLeadPreview[] };

const requireClient = () => {
  if (!supabase) throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  return supabase;
};

export async function listLeadsPage(
  search = "",
  options: { offset?: number; limit?: number; includeTotal?: boolean; signal?: AbortSignal; createdAfter?: string; createdBefore?: string } = {},
): Promise<LeadPage> {
  const client = requireClient();
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 50)));
  let query = client.from("leads").select("*", options.includeTotal === false ? undefined : { count: "exact" }).is("deleted_at", null).order("created_at", { ascending: false });
  if (search.trim()) query = query.or(buildLeadSearchFilter(search));
  if (options.createdAfter) query = query.gte("created_at", options.createdAfter);
  if (options.createdBefore) query = query.lt("created_at", options.createdBefore);
  let pageQuery = query.range(offset, offset + limit - 1);
  if (options.signal) pageQuery = pageQuery.abortSignal(options.signal);
  const { data, count, error } = await pageQuery;
  if (error) throw error;
  return { records: (data ?? []) as LeadRecord[], totalCount: count ?? null };
}

export async function getOrganizationLeadTrend(organizationId: string, days = 30): Promise<LeadTrendPoint[]> {
  const { data, error } = await requireClient().rpc("get_organization_lead_trend", {
    target_organization: organizationId,
    lookback_days: days,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    activity_date: string;
    new_leads: number | string;
    cumulative_leads: number | string;
    status_counts: Record<string, number | string> | null;
  }>;
  return rows.map((row) => ({
    activity_date: String(row.activity_date),
    new_leads: Number(row.new_leads),
    cumulative_leads: Number(row.cumulative_leads),
    status_counts: row.status_counts && typeof row.status_counts === "object"
      ? Object.fromEntries(Object.entries(row.status_counts).map(([status, count]) => [status, Number(count)]))
      : {},
  }));
}

export async function getOrganizationDuplicateLeads(organizationId: string): Promise<DuplicateLeadSummary> {
  const { data, error } = await requireClient().rpc("get_organization_duplicate_leads", {
    target_organization: organizationId,
    result_limit: 8,
  });
  if (error) throw error;
  const row = data?.[0] as { duplicate_lead_count?: unknown; duplicate_leads?: unknown } | undefined;
  if (!row || typeof row.duplicate_lead_count !== "number" && typeof row.duplicate_lead_count !== "string" || !Array.isArray(row.duplicate_leads)) {
    throw new Error("Duplicate lead summary returned an invalid response.");
  }
  const leads = row.duplicate_leads.map((value): DuplicateLeadPreview => {
    if (!value || typeof value !== "object") throw new Error("Duplicate lead summary returned an invalid lead.");
    const lead = value as Record<string, unknown>;
    if (typeof lead.id !== "string" || typeof lead.external_id !== "string" || typeof lead.full_name !== "string" || typeof lead.source !== "string") {
      throw new Error("Duplicate lead summary returned an invalid lead.");
    }
    if (lead.phone !== null && typeof lead.phone !== "string" || lead.email !== null && typeof lead.email !== "string") {
      throw new Error("Duplicate lead summary returned invalid contact details.");
    }
    return {
      id: lead.id,
      external_id: lead.external_id,
      full_name: lead.full_name,
      phone: lead.phone,
      email: lead.email,
      source: lead.source,
    };
  });
  const duplicateCount = Number(row.duplicate_lead_count);
  if (!Number.isSafeInteger(duplicateCount) || duplicateCount < 0) throw new Error("Duplicate lead summary returned an invalid count.");
  return { duplicateCount, leads };
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

export async function bulkCreateLeads(organizationId: string, rows: LeadCsvRecord[]): Promise<{ imported: number; duplicates: number; error?: string }> {
  if (!rows.length) return { imported: 0, duplicates: 0 };
  const client = requireClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in again before importing leads.");
  const { data: membership, error: membershipError } = await client
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .single();
  if (membershipError) throw membershipError;
  if (!membership || !["company_owner", "organization_admin"].includes(membership.role)) {
    throw new Error("Only the company owner or organization admin can bulk import leads.");
  }

  const existingEmails = new Set<string>();
  const existingPhones = new Set<string>();
  const emails = [...new Set(rows.flatMap((row) => row.email ? [row.email] : []))];
  for (let offset = 0; offset < emails.length; offset += 100) {
    const { data, error } = await client
      .from("leads")
      .select("email")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("email", emails.slice(offset, offset + 100));
    if (error) throw error;
    for (const lead of data ?? []) {
      const normalized = normalizeEmail(lead.email);
      if (normalized) existingEmails.add(normalized);
    }
  }
  const phones = [...new Set(rows.flatMap((row) => row.phone ? [row.phone] : []))];
  for (let offset = 0; offset < phones.length; offset += 100) {
    const { data, error } = await client
      .from("leads")
      .select("phone")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("phone", phones.slice(offset, offset + 100));
    if (error) throw error;
    for (const lead of data ?? []) {
      const normalized = normalizePhone(lead.phone);
      if (normalized) existingPhones.add(normalized);
    }
  }
  let duplicateCount = 0;
  const newRows = rows.filter((row) => {
    const duplicate = Boolean((row.email && existingEmails.has(row.email)) || (row.phone && existingPhones.has(row.phone)));
    if (duplicate) duplicateCount += 1;
    return !duplicate;
  });

  let insertedCount = 0;
  for (let offset = 0; offset < newRows.length; offset += 100) {
    const batch = newRows.slice(offset, offset + 100).map((lead) => ({
      ...lead,
      organization_id: organizationId,
      created_by: userData.user.id,
      updated_by: userData.user.id,
    }));
    const { error } = await client.from("leads").insert(batch);
    if (error) {
      return {
        imported: insertedCount,
        duplicates: duplicateCount,
        error: `${insertedCount ? `Stopped after importing ${insertedCount} leads. ` : ""}${error.message}`,
      };
    }
    insertedCount += batch.length;
  }
  return { imported: insertedCount, duplicates: duplicateCount };
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
  const { data, error } = await requireClient()
    .from("organization_members")
    .select("user_id,role,profiles(full_name)")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("role", ["company_owner", "organization_admin", "manager", "agent"]);
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
