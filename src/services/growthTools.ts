export type GrowthTool = {
  id: string;
  name: string;
  description: string;
  repository: string;
  license: string;
  pinnedVersion: string | null;
  pinnedCommit: string | null;
  defaultAccess: "disabled";
  deployment: "isolated_service";
  status: "not_configured";
  securityNotes: string;
};

export const growthTools: GrowthTool[] = [
  {
    id: "open-seo",
    name: "Open SEO",
    description: "Self-hosted website SEO audits with graded reports and prioritized recommendations.",
    repository: "https://github.com/alexsilver8/open-seo",
    license: "MIT",
    pinnedVersion: null,
    pinnedCommit: null,
    defaultAccess: "disabled",
    deployment: "isolated_service",
    status: "not_configured",
    securityNotes: "Requires an isolated backend adapter and SSRF-safe URL validation.",
  },
  {
    id: "open-seo-crawler",
    name: "Open SEO Crawler",
    description: "Technical website crawling, audit checks, AI crawler comparison and XLSX reporting.",
    repository: "https://github.com/puneetindersingh/open-seo-crawler",
    license: "MIT",
    pinnedVersion: null,
    pinnedCommit: null,
    defaultAccess: "disabled",
    deployment: "isolated_service",
    status: "not_configured",
    securityNotes: "Must run outside the frontend with SSRF, robots, rate, timeout and resource controls.",
  },
  {
    id: "google-maps-scraper-kit",
    name: "Google Maps Scraper Kit",
    description: "Local business discovery with review-before-import lead workflows.",
    repository: "https://github.com/Mahanaicoach/google-maps-scraper-kit",
    license: "MIT",
    pinnedVersion: null,
    pinnedCommit: null,
    defaultAccess: "disabled",
    deployment: "isolated_service",
    status: "not_configured",
    securityNotes: "Google Maps terms, lawful basis, suppression and source restrictions require review.",
  },
  {
    id: "leadpro",
    name: "LeadPro",
    description: "Lead generation and outreach tooling reviewed as a separate service, not a second CRM.",
    repository: "https://github.com/CodePhantom-1/LeadPro-4",
    license: "No SPDX license declared",
    pinnedVersion: null,
    pinnedCommit: null,
    defaultAccess: "disabled",
    deployment: "isolated_service",
    status: "not_configured",
    securityNotes: "Do not deploy or redistribute until licensing, consent, suppression and sender controls are resolved.",
  },
  {
    id: "listmonk",
    name: "listmonk",
    description: "Self-hosted newsletter and mailing-list manager with PostgreSQL storage.",
    repository: "https://github.com/knadh/listmonk",
    license: "AGPL-3.0",
    pinnedVersion: null,
    pinnedCommit: null,
    defaultAccess: "disabled",
    deployment: "isolated_service",
    status: "not_configured",
    securityNotes: "Use a separate deployment and review AGPL source-disclosure obligations before modification or hosted use.",
  },
];
