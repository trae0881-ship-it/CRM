import type { PublicContactSubmission } from "../lib/publicContact";

const apiOrigin = import.meta.env.VITE_DATABASE_API_URL?.trim().replace(/\/+$/, "") ?? "";

export type PublicPricingPlan = {
  code: string;
  name: string;
  monthlyPrice: number;
  maxUsers: number | null;
  maxLeads: number | null;
  features: Record<string, unknown>;
};

function requireApiOrigin() {
  if (!apiOrigin) throw new Error("The contact and pricing service is not configured yet.");
  return apiOrigin;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error || "The request could not be completed.");
  if (!body) throw new Error("The server returned an invalid response.");
  return body as T;
}

export async function listPublicPricingPlans() {
  const response = await fetch(`${requireApiOrigin()}/public/plans`, { cache: "no-store" });
  return (await readResponse<{ plans: PublicPricingPlan[] }>(response)).plans;
}

export async function submitPublicContact(input: PublicContactSubmission, idempotencyKey: string, website: string) {
  const response = await fetch(`${requireApiOrigin()}/public/contact`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, idempotencyKey, website }),
    cache: "no-store",
  });
  return readResponse<{ accepted: true; createdAt: string }>(response);
}
