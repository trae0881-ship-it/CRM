import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const allowedRoles = new Set(["company_owner", "organization_admin", "manager", "agent", "auditor"]);

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return json({ error: "Invitation service is not configured" }, 503);
  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller.user) return json({ error: "Invalid session" }, 401);
  const body = await request.json().catch(() => null) as { organizationId?: string; email?: string; role?: string } | null;
  if (!body?.organizationId || !body.email || !body.role || !allowedRoles.has(body.role)) return json({ error: "Invalid invitation details" }, 400);
  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "Enter a valid email address" }, 400);
  const { data: membership, error: membershipError } = await admin.from("organization_members").select("role,is_active").eq("organization_id", body.organizationId).eq("user_id", caller.user.id).eq("is_active", true).maybeSingle();
  if (membershipError) return json({ error: "Organization membership could not be verified" }, 500);
  if (!membership || !["company_owner", "organization_admin"].includes(membership.role)) return json({ error: "You cannot invite members to this organization" }, 403);
  if (body.role === "company_owner" && membership.role !== "company_owner") return json({ error: "Only an owner can invite another owner" }, 403);
  const { data: organization, error: organizationError } = await admin.from("organizations")
    .select("is_active,approval_status").eq("id", body.organizationId).maybeSingle();
  if (organizationError) return json({ error: "Organization status could not be verified" }, 500);
  if (!organization?.is_active || organization.approval_status !== "approved") return json({ error: "This workspace is not approved and active" }, 403);
  const { data: subscription, error: subscriptionError } = await admin.from("subscriptions")
    .select("status,current_period_start,current_period_end,trial_ends_at,has_custom_salesperson_limit,salesperson_limit_override,subscription_plans(max_users,max_salespeople,max_managers,max_admins)")
    .eq("organization_id", body.organizationId).maybeSingle();
  if (subscriptionError) return json({ error: "Subscription limits could not be verified" }, 500);
  if (!subscription || !["trialing", "active"].includes(subscription.status)
    || (subscription.current_period_start && new Date(subscription.current_period_start) > new Date())
    || (subscription.status === "trialing"
      ? subscription.trial_ends_at || subscription.current_period_end
      : subscription.current_period_end
    ) && new Date(subscription.status === "trialing"
      ? subscription.trial_ends_at || subscription.current_period_end
      : subscription.current_period_end!) <= new Date()) {
    return json({ error: "An active subscription is required to invite members" }, 403);
  }
  const plan = Array.isArray(subscription.subscription_plans) ? subscription.subscription_plans[0] : subscription.subscription_plans;
  const { count: activeUsers, error: activeUsersError } = await admin.from("organization_members")
    .select("user_id", { count: "exact", head: true }).eq("organization_id", body.organizationId).eq("is_active", true).neq("role", "super_admin");
  if (activeUsersError) return json({ error: "Active user count could not be verified" }, 500);
  if (plan?.max_users !== null && plan?.max_users !== undefined && (activeUsers ?? 0) >= Number(plan.max_users)) {
    return json({ error: "Subscription total user limit reached" }, 409);
  }
  const roleLimit = body.role === "agent"
    ? subscription.has_custom_salesperson_limit ? subscription.salesperson_limit_override : plan?.max_salespeople
    : body.role === "manager" ? plan?.max_managers
      : ["company_owner", "organization_admin"].includes(body.role) ? plan?.max_admins : null;
  const countRole = body.role === "company_owner" || body.role === "organization_admin"
    ? ["company_owner", "organization_admin"] : [body.role];
  if (roleLimit !== null && roleLimit !== undefined) {
    const { count, error: roleCountError } = await admin.from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", body.organizationId).eq("is_active", true).in("role", countRole);
    if (roleCountError) return json({ error: "Role-specific seat usage could not be verified" }, 500);
    if ((count ?? 0) >= Number(roleLimit)) return json({ error: "Subscription limit for this role has been reached" }, 409);
  }
  const inviteOptions: { data: { organization_id: string; role: string }; redirectTo?: string } = {
    data: { organization_id: body.organizationId, role: body.role },
  };
  const { data: domainConfig, error: domainConfigError } = await admin.rpc("get_public_platform_domain_config");
  if (domainConfigError) {
    console.warn("Canonical invitation redirect unavailable; using the Supabase Site URL.");
  } else if (typeof domainConfig?.canonicalHostname === "string" && domainConfig.canonicalHostname) {
    inviteOptions.redirectTo = `https://${domainConfig.canonicalHostname}/`;
  }
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, inviteOptions);
  if (inviteError || !invited.user) return json({ error: inviteError?.message || "Invitation failed" }, 400);
  const { error: profileError } = await admin.from("profiles").upsert({ id: invited.user.id, full_name: email });
  if (profileError) return json({ error: profileError.message }, 500);
  const { error: memberError } = await admin.from("organization_members").upsert({ organization_id: body.organizationId, user_id: invited.user.id, role: body.role });
  if (memberError) return json({ error: memberError.message }, 500);
  const rawToken = crypto.randomUUID();
  const { error: invitationError } = await admin.from("invitations").insert({ organization_id: body.organizationId, email, role: body.role, invited_by: caller.user.id, token_hash: await hash(rawToken), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() });
  if (invitationError) return json({ error: invitationError.message }, 500);
  return json({ invitedUserId: invited.user.id });
});
