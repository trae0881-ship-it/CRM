import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Meta lead access token is sent in an authorization header, not a URL", async () => {
  const source = await readFile(new URL("../supabase/functions/meta-lead-webhook/index.ts", import.meta.url), "utf8");
  assert.match(source, /fetch\(`https:\/\/graph\.facebook\.com\/\$\{META_API_VERSION\}\/\$\{encodeURIComponent\(leadId\)\}\?fields=\$\{fields\}`, \{\s*headers:\s*\{\s*authorization:\s*`Bearer \$\{token\}`/);
  assert.doesNotMatch(source, /[?&]access_token=\$\{encodeURIComponent\(token\)\}/);
});
