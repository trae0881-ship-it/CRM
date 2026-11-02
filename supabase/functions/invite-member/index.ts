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
  const { data: membership } = await admin.from("organization_members").select("role,is_active").eq("organization_id", body.organizationId).eq("user_id", caller.user.id).eq("is_active", true).single();
  if (!membership || !["company_owner", "organization_admin"].includes(membership.role)) return json({ error: "You cannot invite members to this organization" }, 403);
  if (body.role === "company_owner" && membership.role !== "company_owner") return json({ error: "Only an owner can invite another owner" }, 403);
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(body.email, { data: { organization_id: body.organizationId, role: body.role } });
  if (inviteError || !invited.user) return json({ error: inviteError?.message || "Invitation failed" }, 400);
  const { error: profileError } = await admin.from("profiles").upsert({ id: invited.user.id, full_name: body.email });
  if (profileError) return json({ error: profileError.message }, 500);
  const { error: memberError } = await admin.from("organization_members").upsert({ organization_id: body.organizationId, user_id: invited.user.id, role: body.role });
  if (memberError) return json({ error: memberError.message }, 500);
  const rawToken = crypto.randomUUID();
  const { error: invitationError } = await admin.from("invitations").insert({ organization_id: body.organizationId, email: body.email.toLowerCase(), role: body.role, invited_by: caller.user.id, token_hash: await hash(rawToken), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() });
  if (invitationError) return json({ error: invitationError.message }, 500);
  return json({ invitedUserId: invited.user.id });
});
