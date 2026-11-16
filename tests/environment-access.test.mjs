import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const supabaseClient = await readFile(new URL("../src/lib/supabase.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const header = await readFile(new URL("../src/components/Header.tsx", import.meta.url), "utf8");
const mobileTokens = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const envDocs = await readFile(new URL("../ENVIRONMENT_VARIABLES.md", import.meta.url), "utf8");
const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
const functionNames = await readdir(new URL("../supabase/functions/", import.meta.url), { withFileTypes: true });
const functionSources = (await Promise.all(functionNames.filter((entry) => entry.isDirectory()).map(async (entry) => {
  const files = await readdir(new URL(`../supabase/functions/${entry.name}/`, import.meta.url));
  return files.includes("index.ts")
    ? readFile(new URL(`../supabase/functions/${entry.name}/index.ts`, import.meta.url), "utf8")
    : null;
}))).filter(Boolean);

test("all source-referenced environment variables are inventoried and templated", () => {
  const source = [supabaseClient, ...functionSources].join("\n");
  const referenced = new Set([
    ...Array.from(source.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g), (match) => match[1]),
    ...Array.from(source.matchAll(/(?:Deno\.env\.get|env)\(["']([A-Z0-9_]+)["']\)/g), (match) => match[1]),
  ]);
  for (const variable of referenced) {
    assert.match(envExample, new RegExp(`^${variable}=`, "m"), `${variable} missing from .env.example`);
    assert.ok(envDocs.includes(`\`${variable}\``), `${variable} missing from ENVIRONMENT_VARIABLES.md`);
  }
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.doesNotMatch(envExample, /META_APP_ID/);
});

test("missing Supabase settings fail closed without printing values or showing demo data", () => {
  assert.match(supabaseClient, /Missing required frontend settings:/);
  assert.match(supabaseClient, /VITE_SUPABASE_URL/);
  assert.match(supabaseClient, /VITE_SUPABASE_ANON_KEY/);
  assert.match(app, /if \(supabaseConfigError && !publicMarketingPaths\.has/);
  assert.match(app, /publicMarketingPaths = new Set/);
  assert.match(app, /No demo records are shown/);
});

test("mobile navigation has a usable hit area and accessible keyboard controls", () => {
  assert.match(header, /aria-expanded=\{open\}/);
  assert.match(header, /aria-controls="public-navigation"/);
  assert.match(header, /event\.key === "Escape"/);
  assert.match(mobileTokens, /flex: 0 0 44px/);
  assert.match(mobileTokens, /max-height: calc\(100dvh - 68px\)/);
});

test("shared design tokens use the supplied Adometa reference palette", () => {
  assert.match(mobileTokens, /--adometa-brand: #5144e5/);
  assert.match(mobileTokens, /--adometa-ink: #11152d/);
  assert.match(mobileTokens, /--adometa-canvas: #f8fafc/);
});
