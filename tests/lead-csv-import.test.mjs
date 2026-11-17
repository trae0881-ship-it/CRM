import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const parserSource = await readFile(new URL("../src/lib/leadCsvImport.ts", import.meta.url), "utf8");
const executableSource = parserSource
  .replace('import { normalizeEmail, normalizePhone } from "./googleSheetsSync";', `
    const normalizePhone = (value) => {
      const result = String(value ?? "").replace(/[^\\d+]/g, "");
      return result.length >= 7 ? result : null;
    };
    const normalizeEmail = (value) => {
      const result = String(value ?? "").trim().toLowerCase();
      return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(result) ? result : null;
    };
  `)
  .replace('import type { LeadStatus } from "../types/database";', "");
const compiledParser = ts.transpileModule(executableSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const { parseLeadCsv } = await import(`data:text/javascript;base64,${Buffer.from(compiledParser).toString("base64")}`);

test("CSV import parses quoted commas, escaped quotes, and supported lead fields", () => {
  const parsed = parseLeadCsv('Name,Phone,Email,Company,Source,Status\r\n"Riya, ""R""",+919876543210,RIYA@example.com,"Acme, Inc",Website,Follow-up\r\n');

  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.rows[0].lead, {
    full_name: 'Riya, "R"',
    phone: "+919876543210",
    email: "riya@example.com",
    company: "Acme, Inc",
    city: null,
    state: null,
    source: "Website",
    status: "follow_up",
  });
  assert.deepEqual(parsed.rows[0].errors, []);
});

test("CSV import rejects malformed rows and skips duplicate contact details", () => {
  const parsed = parseLeadCsv("Full Name,Phone,Email,Status\nAsha,9876543210,asha@example.com,New\nAnother,9876543210,other@example.com,New\nBad,123,x,Unknown\n");

  assert.equal(parsed.rows[0].lead?.full_name, "Asha");
  assert.match(parsed.rows[1].errors.join(" "), /Duplicate email or phone/);
  assert.match(parsed.rows[2].errors.join(" "), /Phone number is invalid/);
  assert.match(parsed.rows[2].errors.join(" "), /Email address is invalid/);
  assert.match(parsed.rows[2].errors.join(" "), /Status must be/);
  assert.throws(() => parseLeadCsv('Name,Phone\n"Asha,123\n'), /unclosed quoted field/);
  assert.throws(() => parseLeadCsv("Name\nAsha\n", 0), /limited to 0 data rows/);
});

test("bulk lead import is org-scoped, admin-gated, and reports partial batch completion", async () => {
  const service = await readFile(new URL("../src/services/leads.ts", import.meta.url), "utf8");
  assert.match(service, /Only the company owner or organization admin can bulk import leads/);
  assert.match(service, /\.eq\("organization_id", organizationId\)/);
  assert.match(service, /created_by: userData\.user\.id/);
  assert.match(service, /offset \+= 100/);
  assert.match(service, /Stopped after importing \$\{insertedCount\} leads/);
});

test("Leads page exposes CSV import only to company and organization admins", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const modal = await readFile(new URL("../src/components/LeadCsvImportModal.tsx", import.meta.url), "utf8");
  assert.match(app, /canImport=\{membership\?\.role === "company_owner" \|\| membership\?\.role === "organization_admin"\}/);
  assert.match(app, /setLeadImportRefresh\(\(current\) => current \+ 1\)/);
  assert.match(modal, /Download template/);
  assert.match(modal, /Only valid rows will be added to this organization/);
  assert.match(modal, /duplicate|invalid rows will be skipped/i);
});
