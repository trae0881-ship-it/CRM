import { supabase } from "../lib/supabase";

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

export type PlatformCompany = { id: string; name: string; slug: string; is_active: boolean; created_at: string };
export type PlatformPlan = { id: string; code: string; name: string; price_monthly: number; is_active: boolean; max_users: number | null; max_leads: number | null };
export type PlatformSubscription = { organization_id: string; plan_id: string; status: string; trial_ends_at: string | null; current_period_end: string | null; subscription_plans: PlatformPlan | null };
export type PlatformStats = { companies: number; activeCompanies: number; trialCompanies: number; suspendedCompanies: number; users: number; activeSubscriptions: number; expiredSubscriptions: number; recurringRevenue: number };
export type PlatformAudit = { id: string; organization_id: string | null; action: string; entity_type: string; created_at: string; metadata: Record<string, unknown> };
export type PlatformMember = { organization_id: string; user_id: string; role: string; is_active: boolean; organizations: { name: string } | null; profiles: { full_name: string } | null };
export type PaymentGatewayOverview = { provider: string; enabled: boolean; test_mode: boolean; merchant_id: string | null; connection_status: string; total_attempts: number; reconciled_payments: number; awaiting_reconciliation: number; manual_review_payments: number; failed_payments: number; expired_payments: number; reconciled_amount: number; last_successful_webhook: string | null; last_webhook_error: string | null };

export async function getPlatformStats(): Promise<PlatformStats> {
  const { data, error } = await client().rpc("platform_dashboard_stats");
  if (error) throw error;
  const stats = data as Record<string, number>;
  return {
    companies: Number(stats.companies || 0),
    activeCompanies: Number(stats.active_companies || 0),
    trialCompanies: Number(stats.trial_companies || 0),
    suspendedCompanies: Number(stats.suspended_companies || 0),
    users: Number(stats.users || 0),
    activeSubscriptions: Number(stats.active_subscriptions || 0),
    expiredSubscriptions: Number(stats.expired_subscriptions || 0),
    recurringRevenue: Number(stats.recurring_revenue || 0),
  };
}

export async function listPlatformCompanies() {
  const { data, error } = await client().from("organizations").select("id,name,slug,is_active,created_at").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlatformCompany[];
}

export async function createPlatformCompany(name: string, slug: string) {
  const { data, error } = await client().rpc("platform_create_company", { company_name: name, company_slug: slug });
  if (error) throw error;
  return data as PlatformCompany;
}

export async function updatePlatformCompany(id: string, patch: { name?: string; is_active?: boolean; reason?: string }) {
  if (patch.is_active !== undefined) {
    const { data, error } = await client().rpc("platform_set_company_status", { target_organization: id, target_active: patch.is_active, status_reason: patch.reason || "" });
    if (error) throw error;
    return data as PlatformCompany;
  }
  const { data, error } = await client().rpc("platform_update_company", { target_organization: id, company_name: patch.name || "" });
  if (error) throw error;
  return data as PlatformCompany;
}

export async function listPlatformPlans() {
  const { data, error } = await client().from("subscription_plans").select("id,code,name,price_monthly,is_active,max_users,max_leads").order("price_monthly");
  if (error) throw error;
  return (data ?? []) as PlatformPlan[];
}

export async function listPlatformSubscriptions() {
  const { data, error } = await client().from("subscriptions").select("organization_id,plan_id,status,trial_ends_at,current_period_end,subscription_plans(id,code,name,price_monthly,is_active,max_users,max_leads)").order("current_period_end", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, subscription_plans: Array.isArray(row.subscription_plans) ? ((row.subscription_plans[0] ?? null) as PlatformPlan | null) : row.subscription_plans as PlatformPlan | null })) as PlatformSubscription[];
}

export async function updatePlatformSubscription(organizationId: string, planId: string, status: string) {
  const { error } = await client().rpc("platform_upsert_subscription", { target_organization: organizationId, target_plan: planId, target_status: status });
  if (error) throw error;
}

export async function assignPlatformSubscription(organizationId: string, planId: string, status = "trialing") {
  const { data, error } = await client().rpc("platform_upsert_subscription", { target_organization: organizationId, target_plan: planId, target_status: status });
  if (error) throw error;
  return data as PlatformSubscription;
}

export async function listSubscriptionHistory(organizationId?: string) {
  let query = client().from("subscription_history").select("*").order("created_at", { ascending: false }).limit(100);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listPlatformAudit() {
  const { data, error } = await client().from("audit_logs").select("id,organization_id,action,entity_type,created_at,metadata").is("organization_id", null).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as PlatformAudit[];
}

export async function auditPlatformAction(organizationId: string | null, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  const { error } = await client().rpc("audit_platform_action", { target_org: organizationId, action_name: action, target_entity: entityType, target_id: entityId, action_metadata: metadata });
  if (error) throw error;
}

export async function getPaymentGatewayOverview(): Promise<PaymentGatewayOverview> {
  const { data, error } = await client().rpc("payment_gateway_overview");
  if (error) throw error;
  return data as PaymentGatewayOverview;
}

export async function listPlatformMembers(): Promise<PlatformMember[]> {
  const { data, error } = await client().from("organization_members").select("organization_id,user_id,role,is_active,organizations(name),profiles(full_name)").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    organizations: Array.isArray(row.organizations) ? (row.organizations[0] ?? null) as { name: string } | null : row.organizations as { name: string } | null,
    profiles: Array.isArray(row.profiles) ? (row.profiles[0] ?? null) as { full_name: string } | null : row.profiles as { full_name: string } | null,
  })) as PlatformMember[];
}

export async function updatePlatformMembership(organizationId: string, userId: string, role: string, isActive: boolean) {
  const { error } = await client().rpc("platform_update_membership", {
    target_organization: organizationId,
    target_user: userId,
    target_role: role,
    target_active: isActive,
  });
  if (error) throw error;
}
