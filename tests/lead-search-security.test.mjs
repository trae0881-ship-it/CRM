import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { buildLeadSearchFilter } from "../src/lib/leadSearch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("lead search escapes PostgREST filter delimiters and ILIKE wildcards", () => {
  assert.equal(
    buildLeadSearchFilter('Acme, Inc. (North)"\\'),
    'full_name.ilike."%Acme, Inc. (North)\\"\\\\%",email.ilike."%Acme, Inc. (North)\\"\\\\%",phone.ilike."%Acme, Inc. (North)\\"\\\\%"',
  );
  assert.equal(
    buildLeadSearchFilter("%_"),
    'full_name.ilike."%\\%\\_%",email.ilike."%\\%\\_%",phone.ilike."%\\%\\_%"',
  );
});

test("the Leads page accepts a phone number and searches the phone field", async () => {
  const app = await readFile(path.join(root, "src/App.tsx"), "utf8");
  const service = await readFile(path.join(root, "src/services/leads.ts"), "utf8");
  assert.match(app, /Search by name or phone number/);
  assert.match(app, /onChange=\{\(event\) => onQueryChange\(event\.target\.value\)\}/);
  assert.match(app, /\$\{lead\.phone \|\| ""\}/);
  assert.match(service, /buildLeadSearchFilter\(search\)/);
  assert.match(buildLeadSearchFilter("9876543210"), /phone\.ilike\."%9876543210%"/);
});
