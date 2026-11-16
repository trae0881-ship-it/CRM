import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const enabled = Boolean(process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_ANON_KEY && process.env.SUPABASE_TEST_ACCESS_TOKEN);

test("live Supabase Auth and PostgREST connectivity with an explicit staging user token", {
  skip: enabled ? false : "BLOCKED: configure SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, and a staging-only SUPABASE_TEST_ACCESS_TOKEN",
}, async () => {
  const client = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_ANON_KEY, {
    global: { headers: { authorization: `Bearer ${process.env.SUPABASE_TEST_ACCESS_TOKEN}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: user, error: authError } = await client.auth.getUser(process.env.SUPABASE_TEST_ACCESS_TOKEN);
  assert.equal(authError, null);
  assert.ok(user.user?.id);
  const { error, count } = await client.from("organizations").select("id", { head: true, count: "exact" }).limit(1);
  assert.equal(error, null);
  assert.ok(Number.isInteger(count), "PostgREST count should be available even when RLS filters all rows");
});
