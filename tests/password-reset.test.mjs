import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const auth = await readFile(new URL("../src/services/auth.ts", import.meta.url), "utf8");
const appUrls = await readFile(new URL("../src/lib/appUrls.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

test("password reset uses the deployed app URL", () => {
  assert.match(auth, /redirectTo:\s*await getAuthRedirectUrl\("\/reset-password"\)/);
  assert.match(appUrls, /window\.location\.origin/);
  assert.match(appUrls, /getCanonicalOrigin/);
  assert.match(appUrls, /VITE_SUPABASE_AUTH_ALLOWED_REDIRECT_HOSTS/);
  assert.match(appUrls, /allowedHosts\.has\(candidateHostname\)/);
  assert.match(auth, /resetPasswordForEmail/);
  assert.match(auth, /\/reset-password/);
});

test("workspace and Super Admin login screens expose password reset", () => {
  assert.match(app, /function LoginScreen/);
  assert.match(app, /function SuperAdminLoginScreen/);
  assert.match(app, /Reset Super Admin password/);
  assert.match(app, /Forgot password\?/);
});
