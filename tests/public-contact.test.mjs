import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ADOMETA_WHATSAPP_NUMBER,
  createContactWhatsAppMessage,
  createPlanWhatsAppMessage,
  createWhatsAppUrl,
  validatePublicContact,
} from "../src/lib/publicContact.ts";

const validContact = {
  fullName: "Asha Rao",
  mobile: "+91 91615 33353",
  email: "asha@example.com",
  company: "",
  subject: "CRM enquiry",
  message: "Please share details about organizing our sales leads.",
};

test("contact form validates required identity, mobile, email, subject and message fields", () => {
  assert.ok(Object.values(validatePublicContact(validContact)).every(Boolean));
  assert.equal(validatePublicContact({ ...validContact, mobile: "123" }).mobile, false);
  assert.equal(validatePublicContact({ ...validContact, email: "not-an-email" }).email, false);
  assert.equal(validatePublicContact({ ...validContact, message: "Short" }).message, false);
  assert.equal(validatePublicContact({ ...validContact, company: "x".repeat(161) }).company, false);
});

test("WhatsApp links use the Adometa number and prefill contact and plan details", () => {
  assert.equal(ADOMETA_WHATSAPP_NUMBER, "919161533353");
  const contactMessage = createContactWhatsAppMessage(validContact);
  const contactUrl = new URL(createWhatsAppUrl(contactMessage));
  assert.equal(contactUrl.hostname, "wa.me");
  assert.equal(contactUrl.pathname, "/919161533353");
  assert.match(contactUrl.searchParams.get("text"), /Asha Rao/);
  assert.match(contactUrl.searchParams.get("text"), /asha@example\.com/);
  assert.match(contactUrl.searchParams.get("text"), /Please share details about organizing our sales leads/);
  assert.match(createPlanWhatsAppMessage("Growth", "1,250.00 / month (currency not specified)"), /Growth plan \(1,250\.00 \/ month \(currency not specified\)\)/);
});

test("public marketing routes have substantive content and plan data is not hardcoded in the browser", async () => {
  const source = await readFile(new URL("../src/components/PublicPages.tsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const urls = await readFile(new URL("../src/lib/appUrls.ts", import.meta.url), "utf8");
  const routes = JSON.parse(await readFile(new URL("../shared/application-routes.json", import.meta.url), "utf8"));
  for (const route of ["/", "/features", "/pricing", "/about", "/contact", "/integrations", "/faq", "/privacy", "/terms", "/cookies"]) {
    assert.ok(source.includes(`path === "${route}"`) || source.includes(`"${route}": {`), `public route ${route} should render dedicated content`);
  }
  assert.ok(routes.some((route) => route.route === "/integrations" && route.indexable));
  assert.ok(routes.some((route) => route.route === "/faq" && route.indexable));
  assert.match(app, /supabaseConfigError && !publicMarketingPaths\.has/);
  for (const route of ["/privacy", "/terms", "/cookies"]) assert.ok(urls.includes(`"${route}": {`), `metadata for ${route} should be available`);
  assert.match(source, /listPublicPricingPlans/);
  assert.doesNotMatch(source, /\b(?:Basic|Starter|Growth|Enterprise)\s*₹?\d/);
});
