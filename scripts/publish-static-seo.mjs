import { rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const privateRoute = /^\/(?:login|signup|reset-password|dashboard|super-admin(?:\/|$)|saas\/admin(?:\/|$)|admin\/docs(?:\/|$)|docs(?:\/|$)|health(?:\/|$)|domains(?:\/|$)|sync(?:\/|$))/i;

function normalizeOrigin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a valid HTTPS origin`); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must be an HTTPS origin without credentials, path, query, or fragment`);
  }
  return url.origin;
}

export function prepareStaticSeoAssets(sitemapXml, robotsText, canonicalOriginInput) {
  const canonicalOrigin = normalizeOrigin(canonicalOriginInput, "Canonical origin");
  const matches = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  if (!matches.length || matches.length !== (sitemapXml.match(/<loc>/g) ?? []).length) {
    throw new Error("The generated sitemap is empty or malformed");
  }
  for (const [, location] of matches) {
    let url;
    try { url = new URL(location); } catch { throw new Error("The generated sitemap contains an invalid URL"); }
    if (url.origin !== canonicalOrigin || privateRoute.test(url.pathname)) {
      throw new Error("The generated sitemap contains a non-canonical or private route");
    }
  }
  const cleanedRobots = robotsText.split(/\r?\n/).filter((line) => !/^sitemap\s*:/i.test(line));
  return {
    sitemap: sitemapXml.endsWith("\n") ? sitemapXml : `${sitemapXml}\n`,
    robots: `${cleanedRobots.join("\n").trimEnd()}\nSitemap: ${canonicalOrigin}/sitemap.xml\n`,
  };
}

async function fetchSeoAsset(apiOrigin, path, expectedType) {
  const response = await fetch(new URL(path, apiOrigin), { signal: AbortSignal.timeout(10000), headers: { accept: expectedType } });
  if (!response.ok) throw new Error(`SEO API request failed with HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes(expectedType)) throw new Error("SEO API returned an unexpected content type");
  return response.text();
}

export async function publishStaticSeo({ apiOrigin: apiOriginInput, canonicalOrigin: canonicalOriginInput, outputDirectory = "dist" }) {
  const apiOrigin = normalizeOrigin(apiOriginInput, "SEO API origin");
  const canonicalOrigin = normalizeOrigin(canonicalOriginInput, "Canonical origin");
  const [sitemapXml, robotsText] = await Promise.all([
    fetchSeoAsset(apiOrigin, "/seo/sitemap.xml", "application/xml"),
    fetchSeoAsset(apiOrigin, "/seo/robots.txt", "text/plain"),
  ]);
  const assets = prepareStaticSeoAssets(sitemapXml, robotsText, canonicalOrigin);
  const directory = resolve(outputDirectory);
  const sitemapPath = resolve(directory, "sitemap.xml");
  const robotsPath = resolve(directory, "robots.txt");
  const sitemapTemp = `${sitemapPath}.tmp`;
  const robotsTemp = `${robotsPath}.tmp`;
  try {
    await Promise.all([
      writeFile(sitemapTemp, assets.sitemap, { encoding: "utf8", flag: "w" }),
      writeFile(robotsTemp, assets.robots, { encoding: "utf8", flag: "w" }),
    ]);
    await rename(sitemapTemp, sitemapPath);
    await rename(robotsTemp, robotsPath);
  } catch (error) {
    await Promise.allSettled([unlink(sitemapTemp), unlink(robotsTemp)]);
    throw error;
  }
  return { sitemapPath, robotsPath, urlCount: [...assets.sitemap.matchAll(/<loc>/g)].length };
}

function optionValue(args, option) {
  const index = args.indexOf(option);
  return index < 0 ? "" : args[index + 1] ?? "";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  try {
    const result = await publishStaticSeo({
      apiOrigin: optionValue(args, "--api-origin"),
      canonicalOrigin: optionValue(args, "--canonical-origin"),
      outputDirectory: optionValue(args, "--output") || "dist",
    });
    console.log(`Published ${result.urlCount} public sitemap URLs and robots.txt to ${result.sitemapPath}`);
  } catch (error) {
    console.error(`Static SEO publication failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}
