import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const organizationIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
const getRedirectUri = () => new URL("/functions/v1/google-sheets-oauth", env("SUPABASE_URL")).toString();
const callbackPage = (result: "connected" | "error", message: string, status = 200) => new Response(
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>Google Sheets authorization</title><body><p>${message}</p><script>if(window.opener){window.opener.postMessage({type:"adometa-google-sheets-${result}"},"*");window.close();}</script></body></html>`,
  { status, headers: { ...corsHeaders, "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
);
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
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
      if (url.searchParams.has("error")) return callbackPage("error", "Google authorization was cancelled or rejected.", 400);
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (!state || !code) return callbackPage("error", "Google authorization could not be validated.", 400);
      const admin = getAdmin();
      const { data: oauthState, error: stateError } = await admin.from("google_oauth_states").select("*").eq("state_hash", await sha256(state)).is("used_at", null).gt("expires_at", new Date().toISOString()).single();
      if (stateError || !oauthState) return callbackPage("error", "Google authorization expired. Please try connecting again.", 400);
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), redirect_uri: getRedirectUri(), grant_type: "authorization_code" }) });
      if (!tokenResponse.ok) return callbackPage("error", "Google authorization failed. Check the OAuth client and callback configuration.", 400);
      const tokens = await tokenResponse.json();
      if (!tokens.refresh_token) return callbackPage("error", "Google did not return a refresh token. Revoke Adometa access and try again.", 400);
      const accountResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
      const account = accountResponse.ok ? await accountResponse.json() : {};
      const { error: updateStateError } = await admin.from("google_oauth_states").update({ used_at: new Date().toISOString() }).eq("state_hash", await sha256(state));
      if (updateStateError) return callbackPage("error", "Google authorization could not be completed. Please retry.", 500);
      const { error: integrationError } = await admin.from("google_sheet_integrations").insert({
        organization_id: oauthState.organization_id, created_by: oauthState.user_id, provider_account_email: account.email ?? null,
        spreadsheet_id: `pending-selection:${crypto.randomUUID()}`, spreadsheet_name: null, status: "connected",
        token_ciphertext: await encryptToken(JSON.stringify({ refresh_token: tokens.refresh_token, access_token: tokens.access_token })),
        token_expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(),
      });
      if (integrationError) return callbackPage("error", "Google account could not be saved. Please retry or contact your administrator.", 500);
      return callbackPage("connected", "Google account connected. This window should close automatically.");
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const user = await userFromRequest(request);
    if (!user) return json({ error: "Authentication required" }, 401);
    const body = await request.json().catch(() => null) as { action?: string; organizationId?: string; integrationId?: string; agencyName?: string } | null;
    const admin = getAdmin();
    if (body?.action === "start") {
      if (!body.organizationId || !organizationIdPattern.test(body.organizationId)) {
        return json({ error: "A valid active organization is required to connect Google Sheets." }, 400);
      }
      const { data: membership } = await admin.from("organization_members").select("role").eq("organization_id", body.organizationId).eq("user_id", user.id).eq("is_active", true).single();
      if (!membership || !["company_owner", "organization_admin"].includes(membership.role)) return json({ error: "Google Sheets administration permission required" }, 403);
      const rawState = crypto.randomUUID();
      const { error } = await admin.from("google_oauth_states").insert({ state_hash: await sha256(rawState), organization_id: body.organizationId, user_id: user.id, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
      if (error) return json({ error: "OAuth state could not be created" }, 500);
      const params = new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), redirect_uri: getRedirectUri(), response_type: "code", access_type: "offline", prompt: "consent", scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly", state: rawState });
      return json({ authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }
    if (body?.action === "add-sheet" && body.integrationId) {
      const { data: source, error: sourceError } = await admin.from("google_sheet_integrations")
        .select("organization_id,provider_account_email,token_ciphertext,token_expires_at,status")
        .eq("id", body.integrationId)
        .single();
      if (sourceError || !source) return json({ error: "Google connection not found" }, 404);
      const { data: membership } = await admin.from("organization_members").select("role")
        .eq("organization_id", source.organization_id).eq("user_id", user.id).eq("is_active", true).single();
      if (!membership || !["company_owner", "organization_admin"].includes(membership.role)) {
        return json({ error: "Google Sheets administration permission required" }, 403);
      }
      if (!source.token_ciphertext || source.status === "disconnected") {
        return json({ error: "Reconnect this Google account before adding another sheet" }, 409);
      }
      const agencyName = String(body.agencyName ?? "").trim();
      if (agencyName.length > 120) return json({ error: "Agency name must be 120 characters or fewer" }, 400);
      const { data: created, error: createError } = await admin.from("google_sheet_integrations").insert({
        organization_id: source.organization_id,
        created_by: user.id,
        provider_account_email: source.provider_account_email,
        agency_name: agencyName || null,
        spreadsheet_id: `pending-selection:${crypto.randomUUID()}`,
        spreadsheet_name: null,
        status: "connected",
        token_ciphertext: source.token_ciphertext,
        token_expires_at: source.token_expires_at,
      }).select("id").single();
      if (createError) return json({ error: "A new sheet connection could not be created" }, 500);
      return json({ integrationId: created.id });
    }
    if (body?.action === "disconnect-account" && body.integrationId) {
      const { data: integration, error: integrationError } = await admin.from("google_sheet_integrations")
        .select("organization_id,provider_account_email,token_ciphertext")
        .eq("id", body.integrationId)
        .single();
      if (integrationError || !integration) return json({ error: "Integration not found" }, 404);
      const { data: membership } = await admin.from("organization_members").select("role").eq("organization_id", integration.organization_id).eq("user_id", user.id).eq("is_active", true).single();
      if (!membership || !["company_owner", "organization_admin"].includes(membership.role)) return json({ error: "Google Sheets administration permission required" }, 403);
      let relatedIntegrations = [{ id: body.integrationId }];
      if (integration.provider_account_email) {
        const { data, error } = await admin.from("google_sheet_integrations").select("id")
          .eq("organization_id", integration.organization_id)
          .eq("provider_account_email", integration.provider_account_email);
        if (error) return json({ error: "Linked agency sheets could not be identified" }, 500);
        relatedIntegrations = data ?? relatedIntegrations;
      } else if (integration.token_ciphertext) {
        const { data, error } = await admin.from("google_sheet_integrations").select("id,token_ciphertext")
          .eq("organization_id", integration.organization_id);
        if (error) return json({ error: "Linked agency sheets could not be identified" }, 500);
        relatedIntegrations = (data ?? []).filter((item) => item.token_ciphertext === integration.token_ciphertext).map(({ id }) => ({ id }));
      }

      if (integration.token_ciphertext) {
        const tokens = await decryptToken(integration.token_ciphertext) as { refresh_token?: string; access_token?: string };
        const tokenToRevoke = tokens.refresh_token || tokens.access_token;
        if (tokenToRevoke) {
          let response: Response;
          try {
            response = await fetch("https://oauth2.googleapis.com/revoke", {
              method: "POST",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ token: tokenToRevoke }),
            });
          } catch {
            return json({ error: "Google could not be reached to revoke access. The account is still connected; retry the disconnect." }, 502);
          }
          if (!response.ok && response.status !== 400) {
            return json({ error: `Google access revocation failed (HTTP ${response.status}). The account is still connected.` }, 502);
          }
        }
      }

      const integrationIds = relatedIntegrations.map(({ id }) => id);
      const { error: disconnectError } = await admin.from("google_sheet_integrations").update({
        status: "disconnected",
        token_ciphertext: null,
        disconnected_at: new Date().toISOString(),
        auto_sync: false,
      }).in("id", integrationIds);
      if (disconnectError) return json({ error: "Google account was revoked but its agency sheets could not be disabled. Contact your administrator." }, 500);
      return json({ disconnected: true, integrationCount: integrationIds.length });
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
    if (request.method === "GET") return callbackPage("error", "Google authorization could not be completed. Ask your administrator to check the integration setup.", 500);
    return json({ error: error instanceof Error ? error.message : "Google OAuth service failed" }, 500);
  }
});
