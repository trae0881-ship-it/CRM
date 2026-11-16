export type GrowthToolLicenseStatus = "VERIFIED" | "BLOCKED";
export type GrowthToolReviewStatus = "SECURITY REVIEW COMPLETE" | "BLOCKED";
export type GrowthToolDeploymentStatus = "NOT DEPLOYED" | "DEPLOYED";
export type GrowthToolHealthStatus = "NOT DEPLOYED" | "HEALTHY" | "UNHEALTHY";

export type GrowthTool = {
  id: string;
  name: string;
  repository: string;
  license: string;
  licenseStatus: GrowthToolLicenseStatus;
  licenseNotice: string;
  licenseUrl: string;
  version: string;
  commit: string;
  releaseDate: string | null;
  lastVerifiedDate: string;
  securityReviewStatus: GrowthToolReviewStatus;
  securityNotes: string;
  deploymentStatus: GrowthToolDeploymentStatus;
  healthStatus: GrowthToolHealthStatus;
  notes: string;
};

export const growthTools: GrowthTool[] = [
  {
    id: "open-seo",
    name: "Open SEO",
    repository: "https://github.com/alexsilver8/open-seo",
    license: "MIT",
    licenseStatus: "VERIFIED",
    licenseNotice: "Copyright Alexander Silver (2026); preserve the upstream MIT notice.",
    licenseUrl: "https://github.com/alexsilver8/open-seo/blob/v0.3.0/LICENSE",
    version: "v0.3.0",
    commit: "cc7b9e6f85c613c146d45d63486d246d8497e620",
    releaseDate: "2026-10-11",
    lastVerifiedDate: "2026-11-16",
    securityReviewStatus: "BLOCKED",
    securityNotes: "BLOCKED: the pinned source has a confirmed DNS rebinding SSRF. A local remediation patch binds each request to the validated address; 229 tests, the production build, and the production dependency audit passed in the temporary clone. The patch is not upstream or deployed; keep blocked pending independent review.",
    deploymentStatus: "NOT DEPLOYED",
    healthStatus: "NOT DEPLOYED",
    notes: "Release and license metadata verified against the official GitHub repository. No deployment or health check has been performed.",
  },
  {
    id: "open-seo-crawler",
    name: "Open SEO Crawler",
    repository: "https://github.com/puneetindersingh/open-seo-crawler",
    license: "MIT",
    licenseStatus: "VERIFIED",
    licenseNotice: "Copyright Puneet Inder Singh (2026); preserve the upstream MIT notice.",
    licenseUrl: "https://github.com/puneetindersingh/open-seo-crawler/blob/mcp-v1.0.0/LICENSE",
    version: "mcp-v1.0.0",
    commit: "654350c9ded45b7cc53df9150bfdb092b169b42d",
    releaseDate: "2026-10-16",
    lastVerifiedDate: "2026-11-16",
    securityReviewStatus: "BLOCKED",
    securityNotes: "BLOCKED: the pinned /fetch-robots-txt route has a confirmed unauthenticated redirect SSRF. A local patch validates redirects, pins and peer-checks connections, and binds to loopback; six local tests and the E2E harness (26/26) passed using a test-only loopback fixture stub. The patch is not upstream or deployed.",
    deploymentStatus: "NOT DEPLOYED",
    healthStatus: "NOT DEPLOYED",
    notes: "Release and license metadata verified against the official GitHub repository. No deployment or health check has been performed.",
  },
  {
    id: "google-maps-scraper-kit",
    name: "Google Maps Scraper Kit",
    repository: "https://github.com/Mahanaicoach/google-maps-scraper-kit",
    license: "MIT",
    licenseStatus: "VERIFIED",
    licenseNotice: "Copyright Mahan (2026); preserve the upstream MIT notice.",
    licenseUrl: "https://github.com/Mahanaicoach/google-maps-scraper-kit/blob/v2.3.2/LICENSE",
    version: "v2.3.2",
    commit: "e370d0cb2a255fee3cd894e4ef1ba9aa170191e1",
    releaseDate: "2026-11-10",
    lastVerifiedDate: "2026-11-16",
    securityReviewStatus: "BLOCKED",
    securityNotes: "No confirmed vulnerability in the limited static review; dependency review is incomplete because the public SBOM was unavailable. Only Playwright 1.60.0 was checked against OSV with no matches.",
    deploymentStatus: "NOT DEPLOYED",
    healthStatus: "NOT DEPLOYED",
    notes: "Release and license metadata verified against the official GitHub repository. Do not use against websites or data in violation of terms, privacy obligations, or law.",
  },
  {
    id: "leadpro",
    name: "LeadPro",
    repository: "https://github.com/CodePhantom-1/LeadPro-4",
    license: "No SPDX license declared",
    licenseStatus: "BLOCKED",
    licenseNotice: "No LICENSE file or SPDX metadata was found; the README's MIT badge/link does not establish grant terms when the linked LICENSE is absent. Obtain explicit permission from the copyright owner before use.",
    licenseUrl: "https://github.com/CodePhantom-1/LeadPro-4",
    version: "No release or tag; default-branch snapshot",
    commit: "ef98d85e4e94f9d80578cba142ce1dcda6ea3133",
    releaseDate: null,
    lastVerifiedDate: "2026-11-16",
    securityReviewStatus: "BLOCKED",
    securityNotes: "Blocked by the unresolved license; static review found no confirmed vulnerability, but the public SBOM was unavailable and dependency review is incomplete.",
    deploymentStatus: "NOT DEPLOYED",
    healthStatus: "NOT DEPLOYED",
    notes: "Blocked from deployment, redistribution, or integration until licensing permission is verified. Commit identifies the inspected snapshot only.",
  },
  {
    id: "listmonk",
    name: "listmonk",
    repository: "https://github.com/knadh/listmonk",
    license: "AGPL-3.0",
    licenseStatus: "VERIFIED",
    licenseNotice: "Retain the upstream AGPL-3.0 text (Copyright (C) 2007 Free Software Foundation, Inc.) and all source copyright notices; review network-use and source-availability obligations before operating a modified version.",
    licenseUrl: "https://github.com/knadh/listmonk/blob/v6.2.0/LICENSE",
    version: "v6.2.0",
    commit: "ef0a75872463f10a4848af6c547d1c057405453a",
    releaseDate: "2026-06-26",
    lastVerifiedDate: "2026-11-16",
    securityReviewStatus: "BLOCKED",
    securityNotes: "No confirmed exploitable vulnerability in the limited static review. OSV reported advisories for Goldmark 1.7.12, Echo 4.13.4, and go-jose 4.1.4; complete impact analysis and build/test review before deployment.",
    deploymentStatus: "NOT DEPLOYED",
    healthStatus: "NOT DEPLOYED",
    notes: "Stable release pinned; v7.0.0-beta.2 was excluded. Keep it isolated and complete AGPL compliance review before any deployment.",
  },
];
