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
export type PaymentGatewayOverview = { provider: string; enabled: boolean; test_mode: boolean; merchant_id: string | null; connection_status: string; total_attempts: number; reconciled_payments: number; awaiting_reconciliation: number; manual_review_payments: number; failed_payments: number; expired_payments: number; reconciled_amount: number; last_successful_webhook: string | null; last_webhook_error: string | null };

export async function getPlatformStats(): Promise<PlatformStats> {
  const c = client();
  const [companies, active, trial, suspended, users, activeSubscriptions, expiredSubscriptions, revenue] = await Promise.all([
    c.from("organizations").select("id", { count: "exact", head: true }),
    c.from("organizations").select("id", { count: "exact", head: true }).eq("is_active", true),
    c.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "trialing"),
    c.from("organizations").select("id", { count: "exact", head: true }).eq("is_active", false),
    c.from("profiles").select("id", { count: "exact", head: true }),
    c.from("subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "trialing"]),
    c.from("subscriptions").select("id", { count: "exact", head: true }).in("status", ["expired", "cancelled"]),
    c.from("subscription_plans").select("price_monthly,subscriptions!inner(status)").eq("subscriptions.status", "active"),
  ]);
  const failure = [companies, active, trial, suspended, users, activeSubscriptions, expiredSubscriptions, revenue].find((item) => item.error);
  if (failure?.error) throw failure.error;
  return {
    companies: companies.count ?? 0,
    activeCompanies: active.count ?? 0,
    trialCompanies: trial.count ?? 0,
    suspendedCompanies: suspended.count ?? 0,
    users: users.count ?? 0,
    activeSubscriptions: activeSubscriptions.count ?? 0,
    expiredSubscriptions: expiredSubscriptions.count ?? 0,
    recurringRevenue: (revenue.data ?? []).reduce((sum, row) => sum + Number(row.price_monthly || 0), 0),
  };
}

export async function listPlatformCompanies() {
  const { data, error } = await client().from("organizations").select("id,name,slug,is_active,created_at").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlatformCompany[];
}

export async function createPlatformCompany(name: string, slug: string) {
  const { data, error } = await client().from("organizations").insert({ name: name.trim(), slug: slug.trim().toLowerCase() }).select("id,name,slug,is_active,created_at").single();
  if (error) throw error;
  return data as PlatformCompany;
}

export async function updatePlatformCompany(id: string, patch: { name?: string; is_active?: boolean }) {
  const { data, error } = await client().from("organizations").update(patch).eq("id", id).select("id,name,slug,is_active,created_at").single();
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
  const { error } = await client().from("subscriptions").update({ plan_id: planId, status }).eq("organization_id", organizationId);
  if (error) throw error;
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
