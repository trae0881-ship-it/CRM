const contactIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[1-9]\d{9,14}$/;

function clean(value) {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

export function validateContactPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Enter valid contact details." };
  if (clean(body.website)) return { error: "The enquiry could not be accepted. Review the fields and try again." };
  const fullName = clean(body.fullName);
  const mobile = clean(body.mobile).replace(/[\s()-]/g, "");
  const email = clean(body.email).toLowerCase();
  const company = clean(body.company);
  const subject = clean(body.subject);
  const message = clean(body.message);
  const idempotencyKey = clean(body.idempotencyKey);
  if (fullName.length < 2 || fullName.length > 120) return { error: "Enter a name between 2 and 120 characters." };
  if (!phonePattern.test(mobile)) return { error: "Enter a valid mobile number with country code if needed." };
  if (email.length > 254 || !emailPattern.test(email)) return { error: "Enter a valid email address." };
  if (company.length > 160) return { error: "Company name must be 160 characters or fewer." };
  if (subject.length < 2 || subject.length > 160) return { error: "Enter a subject between 2 and 160 characters." };
  if (message.length < 10 || message.length > 4000) return { error: "Message must be between 10 and 4000 characters." };
  if (!contactIdPattern.test(idempotencyKey)) return { error: "The form session expired. Reload the page and try again." };
  return { value: { fullName, mobile, email, company: company || null, subject, message, idempotencyKey } };
}

export function createRateLimiter({ limit = 5, windowMs = 10 * 60 * 1000, now = Date.now } = {}) {
  const attempts = new Map();
  return (key) => {
    const time = now();
    const current = attempts.get(key);
    if (!current || time - current.startedAt >= windowMs) {
      attempts.set(key, { startedAt: time, count: 1 });
    } else if (current.count >= limit) {
      return false;
    } else {
      current.count += 1;
    }
    if (attempts.size > 2000) {
      for (const [entry, value] of attempts) {
        if (time - value.startedAt >= windowMs) attempts.delete(entry);
      }
      while (attempts.size > 2000) attempts.delete(attempts.keys().next().value);
    }
    return true;
  };
}

export function publicPricingPlan(row) {
  const prices = {
    monthlyPrice: Number(row.price_monthly),
    quarterlyPrice: Number(row.price_quarterly),
    halfYearlyPrice: Number(row.price_half_yearly),
    yearlyPrice: Number(row.price_yearly),
  };
  if (Object.values(prices).some((price) => !Number.isFinite(price) || price < 0)) throw new Error("invalid_plan_price");
  const sourceFeatures = row.features && typeof row.features === "object" && !Array.isArray(row.features) ? row.features : {};
  const features = Object.fromEntries(
    ["reports", "lead_management", "teams", "campaigns", "sales_pipeline", "automation"].filter((key) => {
      const value = sourceFeatures[key];
      return typeof value === "boolean" || typeof value === "string" || typeof value === "number";
    }).map((key) => [key, sourceFeatures[key]]),
  );
  return {
    code: row.code,
    name: row.name,
    description: String(row.description ?? ""),
    currencyCode: row.currency_code || null,
    ...prices,
    maxUsers: row.max_users === null ? null : Number(row.max_users),
    maxSalespeople: row.max_salespeople === null ? null : Number(row.max_salespeople),
    maxManagers: row.max_managers === null ? null : Number(row.max_managers),
    maxLeads: row.max_leads === null ? null : Number(row.max_leads),
    trialDays: Number(row.trial_days || 0),
    validityDays: row.validity_days === null ? null : Number(row.validity_days),
    features,
  };
}
