import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareStaticSeoAssets, publishStaticSeo } from "../scripts/publish-static-seo.mjs";

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset><url><loc>https://crm.example.com/</loc></url><url><loc>https://crm.example.com/domain-guides/index.html</loc></url></urlset>`;
const robots = "User-agent: *\nAllow: /\nDisallow: /dashboard\nSitemap: https://crm.example.com/seo/sitemap.xml\n";

test("static SEO publication points robots to the site-root canonical sitemap", () => {
  const result = prepareStaticSeoAssets(sitemap, robots, "https://crm.example.com");
  assert.match(result.robots, /Sitemap: https:\/\/crm\.example\.com\/sitemap\.xml/);
  assert.doesNotMatch(result.robots, /\/seo\/sitemap\.xml/);
  assert.match(result.robots, /Disallow: \/dashboard/);
  assert.equal((result.sitemap.match(/<loc>/g) ?? []).length, 2);
});

test("static SEO publication rejects private or non-canonical sitemap entries", () => {
  assert.throws(
    () => prepareStaticSeoAssets(`<urlset><url><loc>https://crm.example.com/dashboard</loc></url></urlset>`, robots, "https://crm.example.com"),
    /private route/,
  );
  assert.throws(
    () => prepareStaticSeoAssets(`<urlset><url><loc>https://old.example.com/</loc></url></urlset>`, robots, "https://crm.example.com"),
    /non-canonical/,
  );
});

test("static SEO publication fetches generated assets and writes root build files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "adometa-static-seo-"));
  const output = join(directory, "dist");
  await mkdir(output);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname === "/seo/sitemap.xml") {
      return new Response(sitemap, { status: 200, headers: { "content-type": "application/xml; charset=utf-8" } });
    }
    return new Response(robots, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  };
  try {
    const result = await publishStaticSeo({
      apiOrigin: "https://api.example.com",
      canonicalOrigin: "https://crm.example.com",
      outputDirectory: output,
    });
    assert.equal(result.urlCount, 2);
    assert.equal(await readFile(join(output, "sitemap.xml"), "utf8"), `${sitemap}\n`);
    const rootRobots = await readFile(join(output, "robots.txt"), "utf8");
    assert.match(rootRobots, /Sitemap: https:\/\/crm\.example\.com\/sitemap\.xml/);
    assert.doesNotMatch(rootRobots, /\/seo\/sitemap\.xml/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
