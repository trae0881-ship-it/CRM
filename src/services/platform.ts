import { supabase } from "../lib/supabase";

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

export type PlatformCompany = { id: string; name: string; slug: string; is_active: boolean; approval_status: string; workspace_name: string | null; created_at: string };
export type PlatformPlan = {
  id: string; code: string; name: string; description: string; currency_code: string | null;
  price_monthly: number; price_quarterly: number; price_half_yearly: number; price_yearly: number;
  is_active: boolean; max_users: number | null; max_salespeople: number | null; max_managers: number | null;
  max_admins: number | null; max_leads: number | null; trial_days: number; validity_days: number | null;
  renewal_behavior: "manual" | "contact_required"; expiry_behavior: "suspend";
  features: Record<string, unknown>;
};
export type PlatformSubscription = {
  organization_id: string; plan_id: string; status: string; billing_period: string;
  trial_ends_at: string | null; current_period_start: string | null; current_period_end: string | null;
  has_custom_salesperson_limit: boolean; salesperson_limit_override: number | null;
  subscription_plans: PlatformPlan | null;
};
export type PlatformStats = {
  companies: number; activeCompanies: number; trialCompanies: number; suspendedCompanies: number;
  users: number; organizationAdmins: number; superAdmins: number; activeSubscriptions: number;
  expiredSubscriptions: number; pendingWorkspaceRequests: number; recurringRevenue: number | null;
  recurringRevenueByCurrency: Record<string, number>;
};
export type PlatformLeadAnalytics = {
  totalLeads: number;
  siteVisits: number;
  wonLeads: number;
  openLeads: number;
  duplicateLeads: number;
  statusCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  daily: Array<{ activity_date: string; new_leads: number; cumulative_leads: number }>;
};
export type PlatformAudit = { id: string; organization_id: string | null; action: string; entity_type: string; created_at: string; metadata: Record<string, unknown> };
export type PlatformMember = { organization_id: string; user_id: string; role: string; is_active: boolean; organizations: { name: string } | null; profiles: { full_name: string } | null };
export type PlatformWorkspaceRequest = {
  id: string; requested_by: string; requester_name: string | null; requester_email: string;
  company_name: string; workspace_name: string; contact_phone: string; requested_plan_id: string;
  plan_name: string; additional_information: string; status: string; admin_message: string | null;
  rejection_reason: string | null; created_at: string;
};
export type PlatformChangeRequest = {
  id: string; organization_id: string; organization_name: string; requested_by: string;
  requester_name: string | null; requester_email: string; request_type: string; target_plan_id: string | null;
  target_plan_name: string | null; requested_salespeople: number | null; message: string;
  status: string; admin_message: string | null; created_at: string;
};
export type PlatformSeatOverview = {
  organization_id: string; organization_name: string; subscription_status: string;
  plan_id: string; plan_name: string; active_salespeople: number; salesperson_limit: number | null;
  has_custom_limit: boolean; total_active_users: number;
};
export type PlatformPayment = {
  id: string; organization_id: string; amount: number; currency_code: string | null;
  status: string; verification_method: string | null; external_reference: string | null;
  verified_at: string | null; created_at: string; organizations: { name: string } | null;
};

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
    organizationAdmins: Number(stats.organization_admins || 0),
    superAdmins: Number(stats.super_admins || 0),
    activeSubscriptions: Number(stats.active_subscriptions || 0),
    expiredSubscriptions: Number(stats.expired_subscriptions || 0),
    pendingWorkspaceRequests: Number(stats.pending_workspace_requests || 0),
    recurringRevenue: stats.recurring_revenue === null ? null : Number(stats.recurring_revenue || 0),
    recurringRevenueByCurrency: Object.fromEntries(
      Object.entries((stats.recurring_revenue_by_currency || {}) as Record<string, unknown>)
        .map(([currency, amount]) => [currency, Number(amount)]),
    ),
  };
}

export async function getPlatformLeadAnalytics(): Promise<PlatformLeadAnalytics> {
  const { data, error } = await client().rpc("platform_lead_analytics");
  if (error) throw error;
  const analytics = (data ?? {}) as Record<string, unknown>;
  return {
    totalLeads: Number(analytics.total_leads || 0),
    siteVisits: Number(analytics.site_visits || 0),
    wonLeads: Number(analytics.won_leads || 0),
    openLeads: Number(analytics.open_leads || 0),
    duplicateLeads: Number(analytics.duplicate_leads || 0),
    statusCounts: Object.fromEntries(Object.entries((analytics.status_counts ?? {}) as Record<string, unknown>).map(([key, value]) => [key, Number(value)])),
    sourceCounts: Object.fromEntries(Object.entries((analytics.source_counts ?? {}) as Record<string, unknown>).map(([key, value]) => [key, Number(value)])),
    daily: Array.isArray(analytics.daily) ? analytics.daily.map((point) => {
      const value = point as Record<string, unknown>;
      return {
        activity_date: String(value.activity_date),
        new_leads: Number(value.new_leads || 0),
        cumulative_leads: Number(value.cumulative_leads || 0),
      };
    }) : [],
  };
}

export async function listPlatformCompanies() {
  const [organizations, platformMemberships] = await Promise.all([
    client().from("organizations").select("id,name,slug,is_active,approval_status,workspace_name,created_at").order("created_at", { ascending: false }),
    client().from("organization_members").select("organization_id").eq("role", "super_admin").eq("is_active", true),
  ]);
  if (organizations.error) throw organizations.error;
  if (platformMemberships.error) throw platformMemberships.error;
  const platformOrganizationIds = new Set((platformMemberships.data ?? []).map((membership) => String(membership.organization_id)));
  return ((organizations.data ?? []).filter((organization) => !platformOrganizationIds.has(String(organization.id)))) as PlatformCompany[];
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
  const { data, error } = await client().from("subscription_plans")
    .select("id,code,name,description,currency_code,price_monthly,price_quarterly,price_half_yearly,price_yearly,is_active,max_users,max_salespeople,max_managers,max_admins,max_leads,trial_days,validity_days,renewal_behavior,expiry_behavior,features")
    .order("price_monthly");
  if (error) throw error;
  return (data ?? []) as PlatformPlan[];
}

export async function listPlatformSubscriptions() {
  const { data, error } = await client().from("subscriptions")
    .select("organization_id,plan_id,status,billing_period,trial_ends_at,current_period_start,current_period_end,has_custom_salesperson_limit,salesperson_limit_override,subscription_plans(id,code,name,description,currency_code,price_monthly,price_quarterly,price_half_yearly,price_yearly,is_active,max_users,max_salespeople,max_managers,max_admins,max_leads,trial_days,validity_days,renewal_behavior,expiry_behavior,features)")
    .order("current_period_end", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, subscription_plans: Array.isArray(row.subscription_plans) ? ((row.subscription_plans[0] ?? null) as PlatformPlan | null) : row.subscription_plans as PlatformPlan | null })) as PlatformSubscription[];
}

export type SubscriptionConfiguration = {
  organizationId: string; planId: string; status: "active" | "trialing";
  billingPeriod: "monthly" | "quarterly" | "half_yearly" | "yearly";
  useCustomSalespersonLimit: boolean; salespersonLimit: number | null;
  manualPaymentConfirmed: boolean; manualPaymentAmount: number | null;
  manualPaymentCurrency: string | null; manualPaymentReference: string | null;
};

export async function configurePlatformSubscription(input: SubscriptionConfiguration) {
  const { data, error } = await client().rpc("platform_configure_subscription", {
    target_organization: input.organizationId,
    target_plan: input.planId,
    target_status: input.status,
    target_billing_period: input.billingPeriod,
    target_period_start: null,
    target_period_end: null,
    use_custom_salesperson_limit: input.useCustomSalespersonLimit,
    target_salesperson_limit: input.salespersonLimit,
    manual_payment_confirmed: input.manualPaymentConfirmed,
    manual_payment_amount: input.manualPaymentAmount,
    manual_payment_currency: input.manualPaymentCurrency,
    manual_payment_reference: input.manualPaymentReference,
  });
  if (error) throw error;
  return data as PlatformSubscription;
}

export type PlanConfiguration = Omit<PlatformPlan, "id"> & { id: string | null };

export async function savePlatformPlan(input: PlanConfiguration) {
  const { data, error } = await client().rpc("platform_upsert_subscription_plan", {
    target_plan: input.id,
    plan_code: input.code,
    plan_name: input.name,
    plan_description: input.description,
    plan_currency: input.currency_code,
    monthly_price: input.price_monthly,
    quarterly_price: input.price_quarterly,
    half_yearly_price: input.price_half_yearly,
    yearly_price: input.price_yearly,
    total_user_limit: input.max_users,
    salesperson_limit: input.max_salespeople,
    manager_limit: input.max_managers,
    admin_limit: input.max_admins,
    lead_limit: input.max_leads,
    plan_trial_days: input.trial_days,
    plan_validity_days: input.validity_days,
    plan_renewal_behavior: input.renewal_behavior,
    plan_expiry_behavior: input.expiry_behavior,
    plan_features: input.features,
    plan_active: input.is_active,
  });
  if (error) throw error;
  return data as PlatformPlan;
}

export async function listPlatformWorkspaceRequests(): Promise<PlatformWorkspaceRequest[]> {
  const { data, error } = await client().rpc("platform_list_workspace_requests");
  if (error) throw error;
  return (data ?? []) as PlatformWorkspaceRequest[];
}

export async function decidePlatformWorkspaceRequest(input: {
  id: string; decision: "information_requested" | "approve" | "reject"; planId?: string;
  billingPeriod?: "monthly" | "quarterly" | "half_yearly" | "yearly"; subscriptionStatus?: "active" | "trialing";
  salespersonLimit?: number | null; manualPaymentConfirmed?: boolean; manualPaymentAmount?: number | null;
  manualPaymentCurrency?: string | null; manualPaymentReference?: string | null; adminMessage?: string; rejectionReason?: string;
}) {
  const { data, error } = await client().rpc("platform_decide_workspace_request", {
    target_request: input.id,
    decision_name: input.decision,
    target_plan: input.planId ?? null,
    target_billing_period: input.billingPeriod ?? "monthly",
    target_subscription_status: input.subscriptionStatus ?? "trialing",
    target_salesperson_limit: input.salespersonLimit ?? null,
    target_period_start: null,
    target_period_end: null,
    manual_payment_confirmed: input.manualPaymentConfirmed ?? false,
    manual_payment_amount: input.manualPaymentAmount ?? null,
    manual_payment_currency: input.manualPaymentCurrency ?? null,
    manual_payment_reference: input.manualPaymentReference ?? null,
    admin_message: input.adminMessage ?? null,
    rejection_reason: input.rejectionReason ?? null,
  });
  if (error) throw error;
  return data;
}

export async function listPlatformChangeRequests(): Promise<PlatformChangeRequest[]> {
  const { data, error } = await client().rpc("platform_list_subscription_change_requests");
  if (error) throw error;
  return (data ?? []) as PlatformChangeRequest[];
}

export async function reviewPlatformChangeRequest(id: string, decision: "information_requested" | "approved" | "rejected", message: string) {
  const { data, error } = await client().rpc("platform_review_subscription_change_request", {
    target_request: id, decision_name: decision, admin_message: message,
  });
  if (error) throw error;
  return data;
}

export async function listPlatformSeatOverview(): Promise<PlatformSeatOverview[]> {
  const { data, error } = await client().rpc("platform_list_workspace_seats");
  if (error) throw error;
  return (data ?? []) as PlatformSeatOverview[];
}

export async function updatePlatformSalespersonLimit(organizationId: string, limit: number, reason: string) {
  const { error } = await client().rpc("platform_update_salesperson_limit", {
    target_organization: organizationId, target_limit: limit, change_reason: reason,
  });
  if (error) throw error;
}

export async function expirePlatformSubscriptions() {
  const { data, error } = await client().rpc("platform_expire_overdue_subscriptions");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function listPlatformPayments(): Promise<PlatformPayment[]> {
  const { data, error } = await client().from("payments")
    .select("id,organization_id,amount,currency_code,status,verification_method,external_reference,verified_at,created_at,organizations(name)")
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    organizations: Array.isArray(row.organizations) ? (row.organizations[0] ?? null) : row.organizations,
  })) as PlatformPayment[];
}

export async function listSubscriptionHistory(organizationId?: string) {
  let query = client().from("subscription_history").select("*").order("created_at", { ascending: false }).limit(100);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listPlatformAudit() {
  const { data, error } = await client().from("audit_logs").select("id,organization_id,action,entity_type,created_at,metadata").is("organization_id", null).order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as PlatformAudit[];
}

export async function auditPlatformAction(organizationId: string | null, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  const { error } = await client().rpc("audit_platform_action", { target_org: organizationId, action_name: action, target_entity: entityType, target_id: entityId, action_metadata: metadata });
  if (error) throw error;
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
