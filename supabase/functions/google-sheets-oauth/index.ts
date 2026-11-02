import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const getAdmin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

async function encryptToken(value: string) {
  const keyBytes = Uint8Array.from(atob(env("GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY")), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  const output = new Uint8Array(iv.length + ciphertext.length);
  output.set(iv); output.set(ciphertext, iv.length);
  return btoa(String.fromCharCode(...output));
}
async function decryptToken(value: string) {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const keyBytes = Uint8Array.from(atob(env("GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY")), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12))));
}

async function userFromRequest(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await getAdmin().auth.getUser(token);
  return data.user ?? null;
}

Deno.serve(async (request) => {
  try {
    const url = new URL(request.url);
    if (request.method === "GET" && url.searchParams.get("code")) {
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (!state || !code) return json({ error: "Invalid OAuth callback" }, 400);
      const admin = getAdmin();
      const { data: oauthState, error: stateError } = await admin.from("google_oauth_states").select("*").eq("state_hash", await sha256(state)).is("used_at", null).gt("expires_at", new Date().toISOString()).single();
      if (stateError || !oauthState) return json({ error: "OAuth state expired or invalid" }, 400);
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), redirect_uri: env("GOOGLE_SHEETS_REDIRECT_URI"), grant_type: "authorization_code" }) });
      if (!tokenResponse.ok) return json({ error: "Google authorization failed" }, 400);
      const tokens = await tokenResponse.json();
      if (!tokens.refresh_token) return json({ error: "Google did not return a refresh token; revoke access and try again" }, 400);
      const accountResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
      const account = accountResponse.ok ? await accountResponse.json() : {};
      const { error: updateStateError } = await admin.from("google_oauth_states").update({ used_at: new Date().toISOString() }).eq("state_hash", await sha256(state));
      if (updateStateError) return json({ error: "OAuth state could not be completed" }, 500);
      const { error: integrationError } = await admin.from("google_sheet_integrations").insert({
        organization_id: oauthState.organization_id, created_by: oauthState.user_id, provider_account_email: account.email ?? null,
        spreadsheet_id: "pending-selection", spreadsheet_name: null, status: "connected",
        token_ciphertext: await encryptToken(JSON.stringify({ refresh_token: tokens.refresh_token, access_token: tokens.access_token })),
        token_expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(),
      });
      if (integrationError) return json({ error: "Google integration could not be saved" }, 500);
      return new Response("<html><body>Google account connected. You may close this window.</body></html>", { headers: { "content-type": "text/html" } });
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const user = await userFromRequest(request);
    if (!user) return json({ error: "Authentication required" }, 401);
    const body = await request.json().catch(() => null) as { action?: string; organizationId?: string; integrationId?: string } | null;
    const admin = getAdmin();
    if (body?.action === "start" && body.organizationId) {
      const { data: membership } = await admin.from("organization_members").select("role").eq("organization_id", body.organizationId).eq("user_id", user.id).eq("is_active", true).single();
      if (!membership || !["company_owner", "organization_admin"].includes(membership.role)) return json({ error: "Google Sheets administration permission required" }, 403);
      const rawState = crypto.randomUUID();
      const { error } = await admin.from("google_oauth_states").insert({ state_hash: await sha256(rawState), organization_id: body.organizationId, user_id: user.id, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
      if (error) return json({ error: "OAuth state could not be created" }, 500);
      const params = new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), redirect_uri: env("GOOGLE_SHEETS_REDIRECT_URI"), response_type: "code", access_type: "offline", prompt: "consent", scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly", state: rawState });
      return json({ authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }
    if (body?.action === "disconnect" && body.integrationId) {
      const { data: integration } = await admin.from("google_sheet_integrations").select("organization_id,token_ciphertext").eq("id", body.integrationId).single();
      if (!integration) return json({ error: "Integration not found" }, 404);
      const { data: membership } = await admin.from("organization_members").select("role").eq("organization_id", integration.organization_id).eq("user_id", user.id).eq("is_active", true).single();
      if (!membership || !["company_owner", "organization_admin"].includes(membership.role)) return json({ error: "Google Sheets administration permission required" }, 403);
      await admin.from("google_sheet_integrations").update({ status: "disconnected", token_ciphertext: null, disconnected_at: new Date().toISOString(), auto_sync: false }).eq("id", body.integrationId);
      return json({ disconnected: true });
    }
    if (body?.action === "list-spreadsheets" && body.integrationId) {
      const { data: integration } = await admin.from("google_sheet_integrations").select("organization_id,token_ciphertext").eq("id", body.integrationId).single();
      if (!integration) return json({ error: "Integration not found" }, 404);
      const { data: membership } = await admin.from("organization_members").select("role").eq("organization_id", integration.organization_id).eq("user_id", user.id).eq("is_active", true).single();
      if (!membership || !["company_owner", "organization_admin"].includes(membership.role)) return json({ error: "Google Sheets administration permission required" }, 403);
      const token = await decryptToken(integration.token_ciphertext);
      const response = await fetch("https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id,name)&pageSize=100", { headers: { authorization: `Bearer ${token.access_token}` } });
      if (!response.ok) return json({ error: "Google Drive spreadsheet listing failed" }, 502);
      return json(await response.json());
    }
    return json({ error: "Invalid OAuth action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Google OAuth service failed" }, 500);
  }
});
