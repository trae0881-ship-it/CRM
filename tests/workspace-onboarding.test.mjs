import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("workspace onboarding keeps successful data when another setup request fails", async () => {
  const component = await readFile(path.join(root, "src/components/WorkspaceOnboardingView.tsx"), "utf8");
  assert.match(component, /Promise\.allSettled\(\[/);
  assert.match(component, /plansResult\.status === "fulfilled"/);
  assert.match(component, /requestsResult\.status === "fulfilled"/);
  assert.match(component, /accessResult\.status === "fulfilled"/);
  assert.match(component, /Account details:/);
});

test("workspace onboarding distinguishes plan loading errors from an empty active plan list", async () => {
  const component = await readFile(path.join(root, "src/components/WorkspaceOnboardingView.tsx"), "utf8");
  assert.match(component, /plansLoadFailed/);
  assert.match(component, /!plansLoadFailed && plans\.length === 0/);
  assert.match(component, /onClick=\{\(\) => void load\(\)\}>Retry/);
});
