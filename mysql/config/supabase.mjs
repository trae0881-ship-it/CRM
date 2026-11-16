import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerConfig } from "./env.mjs";

let client;

export function getSupabaseAdmin() {
  if (!client) {
    const config = getSupabaseServerConfig();
    client = createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { headers: { "x-client-info": "adometa-mysql-sync/1" } },
    });
  }
  return client;
}

export async function verifyPlatformSuperAdmin(token) {
  const admin = getSupabaseAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError) {
    if (userError.status >= 500 || userError.status === 429) throw new Error("supabase_auth_unavailable");
    return null;
  }
  if (!userData.user) return null;
  const { data, error } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userData.user.id)
    .eq("role", "super_admin")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("membership_verification_unavailable");
  if (!data) return null;
  return { userId: userData.user.id, organizationId: data.organization_id };
}
