import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = await crypto.subtle.digest("SHA-256", encoder.encode(left));
  const b = await crypto.subtle.digest("SHA-256", encoder.encode(right));
  const leftBytes = new Uint8Array(a);
  const rightBytes = new Uint8Array(b);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const setupSecret = Deno.env.get("SUPER_ADMIN_BOOTSTRAP_SECRET");
  if (!supabaseUrl || !serviceRole || !anonKey || !setupSecret) return json({ error: "Bootstrap is not configured" }, 503);

  const authorization = request.headers.get("authorization");
  const suppliedSecret = request.headers.get("x-bootstrap-secret");
  if (!authorization || !suppliedSecret || !(await constantTimeEqual(suppliedSecret, setupSecret))) return json({ error: "Bootstrap authentication failed" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { authorization } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Authenticated user required" }, 401);

  let body: { platformName?: string };
  try { body = await request.json(); } catch { return json({ error: "Invalid request body" }, 400); }
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("bootstrap_first_super_admin", {
    target_user: userData.user.id,
    platform_name: body.platformName || "Adometa Platform",
  });
  if (error) return json({ error: error.message }, error.message.includes("already exists") ? 409 : 400);
  return json({ organizationId: data });
});
