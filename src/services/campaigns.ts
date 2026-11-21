import { supabase } from "../lib/supabase";
import { buildLeadSearchFilter } from "../lib/leadSearch.mjs";

export type OrganizationCampaign = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  status: "active" | "paused" | "archived";
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

export type CampaignAccessRecord = { campaign_id: string; user_id: string };
export type CampaignLead = {
  id: string;
  external_id: string;
  full_name: string;
  phone: string | null;
  company: string | null;
  source: string;
  status: string;
  campaign_id: string | null;
  created_at: string;
};

const requireClient = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

export async function listOrganizationCampaigns(organizationId: string): Promise<OrganizationCampaign[]> {
  const { data, error } = await requireClient()
    .from("campaigns")
    .select("id,organization_id,name,description,status,starts_at,ends_at,created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OrganizationCampaign[];
}

export async function listCampaignAccess(campaignIds: string[]): Promise<CampaignAccessRecord[]> {
  if (!campaignIds.length) return [];
  const { data, error } = await requireClient()
    .from("campaign_members")
    .select("campaign_id,user_id")
    .in("campaign_id", campaignIds);
  if (error) throw error;
  return (data ?? []) as CampaignAccessRecord[];
}

export async function createOrganizationCampaign(input: {
  organizationId: string;
  name: string;
  description: string;
  memberIds: string[];
}): Promise<string> {
  const { data, error } = await requireClient().rpc("create_organization_campaign", {
    target_organization: input.organizationId,
    target_name: input.name,
    target_description: input.description || null,
    target_member_ids: input.memberIds,
  });
  if (error) throw error;
  if (typeof data !== "string" || !data) throw new Error("Campaign was created without a valid ID.");
  return data;
}

export async function setCampaignAccess(campaignId: string, memberIds: string[]): Promise<void> {
  const { error } = await requireClient().rpc("set_campaign_access", {
    target_campaign: campaignId,
    target_member_ids: memberIds,
  });
  if (error) throw error;
}

export async function setLeadCampaign(externalId: string, campaignId: string | null): Promise<void> {
  const { error } = await requireClient().rpc("set_lead_campaign", {
    target_external_id: externalId,
    target_campaign_id: campaignId,
  });
  if (error) throw error;
}

export type CampaignLeadPage = { leads: CampaignLead[]; totalCount: number };

export async function listCampaignLeads(campaignId: string, page = 1, pageSize = 10): Promise<CampaignLeadPage> {
  const { data, count, error } = await requireClient()
    .from("leads")
    .select("id,external_id,full_name,phone,company,source,status,campaign_id,created_at", { count: "exact" })
    .eq("campaign_id", campaignId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return { leads: (data ?? []) as CampaignLead[], totalCount: count ?? 0 };
}

export async function searchCampaignLeadCandidates(organizationId: string, search = "", page = 1, pageSize = 10): Promise<CampaignLeadPage> {
  let query = requireClient()
    .from("leads")
    .select("id,external_id,full_name,phone,company,source,status,campaign_id,created_at", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("campaign_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (search.trim()) query = query.or(buildLeadSearchFilter(search));
  const { data, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return { leads: (data ?? []) as CampaignLead[], totalCount: count ?? 0 };
}
