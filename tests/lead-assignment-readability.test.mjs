import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("lead assignment is clear in the list, creation form, and lead details", async () => {
  const app = await readFile(path.join(root, "src/App.tsx"), "utf8");
  assert.match(app, /ASSIGNED TO/);
  assert.match(app, /lead\.assignedTo \? "Reassign" : "Assign"/);
  assert.match(app, /name="assigned_to"/);
  assert.match(app, /lead\.assigned_to \? "Assigned teammate" : "Unassigned"/);
  assert.match(app, /"Arrived", new Date\(lead\.created_at\)\.toLocaleString\(\)/);
  assert.match(app, /toLocaleTimeString\(\[\], \{ hour: "2-digit", minute: "2-digit" \}\)/);
});

test("lead creation validates assignees against active organization members", async () => {
  const service = await readFile(path.join(root, "src/services/leads.ts"), "utf8");
  assert.match(service, /Only organization admins and managers can assign leads during creation/);
  assert.match(service, /\.eq\("organization_id", membership\.organization_id\)[\s\S]*?\.eq\("user_id", input\.assigned_to\)[\s\S]*?\.eq\("is_active", true\)/);
  assert.match(service, /Select an active salesperson from this organization/);
});
