import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { ArrowRight, BarChart3, Check, CircleHelp, ClipboardCheck, Clock3, Layers3, MessageCircle, ShieldCheck, UsersRound } from "lucide-react";
import { PublicLoading } from "./PublicLoading";
import {
  ADOMETA_WHATSAPP_DISPLAY,
  createContactWhatsAppMessage,
  createPlanWhatsAppMessage,
  createWhatsAppUrl,
  validatePublicContact,
  type PublicContactSubmission,
} from "../lib/publicContact";
import { listPublicPricingPlans, submitPublicContact, type PublicPricingPlan } from "../services/publicWebsite";

function PublicHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <section className="marketing-hero"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="marketing-lead">{description}</p>{children}</section>;
}

const workflow = [
  { title: "Capture", description: "Bring enquiries into one lead record." },
  { title: "Organize", description: "Track status, ownership and next steps." },
  { title: "Follow up", description: "Record calls and plan the next touchpoint." },
  { title: "Review", description: "Use team views and reports to see progress." },
];

export function HomePage() {
  return <div className="marketing-page">
    <PublicHero eyebrow="ADOMETA CRM" title="A clear next step for every lead." description="Adometa is a shared sales workspace for capturing enquiries, organizing lead details, assigning ownership and keeping follow-ups visible." >
      <div className="marketing-actions"><a className="button primary" href="/signup">Create an account <ArrowRight size={16} /></a><a className="button secondary" href="/contact">Talk to the team</a></div>
    </PublicHero>
    <section className="workflow-section"><div className="section-heading"><p className="eyebrow">HOW THE WORKFLOW FITS TOGETHER</p><h2>From enquiry to a considered follow-up</h2><p>Use the shared workspace to keep lead context and sales activity together.</p></div><div className="workflow-grid">{workflow.map((step, index) => <article className="workflow-card" key={step.title}><span className="workflow-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.description}</p></article>)}</div></section>
    <section className="home-value-grid"><article><Layers3 /><h2>One place for lead context</h2><p>Keep contact details, source, status, owner and activity history in organization-scoped records.</p></article><article><Clock3 /><h2>Follow-ups you can review</h2><p>Schedule tasks and record manually initiated calls; the CRM does not place calls automatically.</p></article><article><BarChart3 /><h2>Visibility for the team</h2><p>Review configured reports and team activity according to your role and organization access.</p></article></section>
    <section className="marketing-callout"><div><p className="eyebrow">A PRACTICAL START</p><h2>See whether Adometa fits your sales process.</h2><p>Ask about your workflow, plan options and setup requirements.</p></div><a className="button primary" href="/contact">Contact Adometa <ArrowRight size={16} /></a></section>
  </div>;
}

const featureCards = [
  { icon: Layers3, title: "Lead capture and records", does: "Create organization-scoped lead records with contact details, source, status and custom fields.", works: "Authorized team members add records in the CRM; access is governed by organization membership and database policies.", who: "Salespeople and sales managers.", problem: "Reduces scattered lead details and makes ownership easier to see." },
  { icon: UsersRound, title: "Assignment and team access", does: "Assign and transfer leads, manage teams and invite members through role-authorized workflows.", works: "Managers and administrators use backend-authorized operations; salespeople see leads permitted to them.", who: "Sales managers, organization admins and company owners.", problem: "Clarifies who is responsible while respecting role boundaries." },
  { icon: ClipboardCheck, title: "Pipeline and follow-ups", does: "Track pipeline stages, tasks, reminders and activity history where configured.", works: "Move leads through the available pipeline and record follow-up activity in the CRM.", who: "Sales teams and managers.", problem: "Helps teams see the next action instead of relying on memory." },
  { icon: Clock3, title: "Calling workspace", does: "Present an eligible lead and record a manual call outcome or next follow-up.", works: "The workspace opens your device dialer; the user places and records the call.", who: "Salespeople.", problem: "Connects call notes and next steps to lead context without claiming automated telephony." },
  { icon: BarChart3, title: "Reports and targets", does: "Show report and target views backed by organization data and configured records.", works: "Access is limited by the signed-in user's organization role.", who: "Salespeople, managers and organization owners.", problem: "Makes recorded progress easier to review." },
  { icon: ShieldCheck, title: "Permissions and tenant boundaries", does: "Apply role-based access and organization isolation to CRM data.", works: "Supabase authentication, backend authorization and row-level security control access.", who: "Every organization using the workspace.", problem: "Keeps access aligned to membership rather than relying on hidden UI controls." },
];

export function FeaturesPage() {
  return <div className="marketing-page">
    <PublicHero eyebrow="PRODUCT FEATURES" title="Tools for a more organized sales workflow." description="Explore capabilities present in the Adometa CRM project. Availability depends on role, configuration and the deployed integrations." />
    <div className="feature-grid">{featureCards.map(({ icon: Icon, ...feature }) => <article className="feature-card" key={feature.title}><span className="feature-icon"><Icon size={20} /></span><h2>{feature.title}</h2><p><strong>What it does:</strong> {feature.does}</p><p><strong>How it works:</strong> {feature.works}</p><p><strong>Who uses it:</strong> {feature.who}</p><p><strong>Problem it helps with:</strong> {feature.problem}</p></article>)}</div>
    <section className="integration-notice"><h2>Integrations: current availability</h2><p>Google Sheets has a server-side integration path and requires provider credentials and setup. Meta Lead Ads is disabled. WhatsApp currently opens a visitor- or user-initiated click-to-chat link; no WhatsApp Business API notification is configured. YouPI production payments remain disabled.</p><div className="marketing-actions"><a className="button secondary" href="/integrations">Integration details</a><a className="button secondary" href="/faq">Frequently asked questions</a></div></section>
  </div>;
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
}

function planAudience(plan: PublicPricingPlan) {
  const caps = [
    plan.maxUsers === null ? "no configured user cap" : `up to ${plan.maxUsers} users`,
    plan.maxLeads === null ? "no configured lead cap" : `up to ${plan.maxLeads.toLocaleString("en-IN")} leads`,
  ];
  return `For teams whose needs fit the configured limits: ${caps.join(" and ")}.`;
}

function planFeatures(plan: PublicPricingPlan) {
  const labels: Record<string, string> = {
    lead_management: "Lead management",
    teams: "Team workflows",
    campaigns: "Campaign records",
  };
  const configured = Object.entries(labels).filter(([key]) => plan.features[key] === true).map(([, label]) => label);
  if (typeof plan.features.reports === "string") {
    configured.unshift(`${plan.features.reports === "advanced" ? "Advanced" : "Basic"} reports`);
  }
  return configured;
}

export function PricingPage() {
  const [plans, setPlans] = useState<PublicPricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void listPublicPricingPlans().then((items) => {
      if (active) setPlans(items);
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : "Configured pricing could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <PublicLoading message="Loading configured plan information" />;
  return <div className="marketing-page">
    <PublicHero eyebrow="PRICING" title="Plan details from Adometa's active configuration." description="Plan names, monthly amounts and limits are loaded from active subscription plan records. The current schema does not define a currency; confirm currency and commercial terms with the team before purchase." />
    {error ? <section className="card pricing-state" role="alert"><CircleHelp /><h2>Current plan details are unavailable</h2><p>{error} No prices or limits are guessed or substituted.</p><a className="button primary" href="/contact">Ask about plans</a></section>
      : plans.length === 0 ? <section className="card pricing-state"><CircleHelp /><h2>No active plans are published</h2><p>Contact Adometa for current plan information.</p><a className="button primary" href="/contact">Ask about plans</a></section>
      : <div className="pricing-grid">{plans.map((plan) => {
        const price = `${formatPrice(plan.monthlyPrice)} / month (currency not specified)`;
        const features = planFeatures(plan);
        const message = createPlanWhatsAppMessage(plan.name, price);
        return <article className="pricing-card" key={plan.code}><p className="eyebrow">ADOMETA CRM PLAN</p><h2>{plan.name}</h2><p className="plan-price">{price}</p><p className="plan-audience">{planAudience(plan)}</p><div className="plan-limits"><span>{plan.maxUsers === null ? "No configured user limit" : `${plan.maxUsers} users maximum`}</span><span>{plan.maxLeads === null ? "No configured lead limit" : `${plan.maxLeads.toLocaleString("en-IN")} leads maximum`}</span></div><h3>Configured features</h3>{features.length ? <ul>{features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul> : <p className="muted">Ask Adometa to confirm included features for this plan.</p>}<p className="plan-caveat">Checkout, taxes and payment terms must be confirmed with Adometa. Advanced integrations depend on provider setup.</p><a className="button primary whatsapp-button" href={createWhatsAppUrl(message)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />Get Started on WhatsApp</a></article>;
      })}</div>}
  </div>;
}

const aboutSections = [
  ["Why Adometa CRM was created", "Businesses often keep enquiries across spreadsheets, inboxes, chat threads and personal reminders. That makes lead ownership, context and the next follow-up harder to coordinate. Adometa CRM brings those work items into one organization-scoped workspace."],
  ["How the workflow helps", "Teams can capture and organize lead records, assign ownership, track status and pipeline stages, record activity and plan follow-ups. Where available, imports and integrations can bring in data without making the browser the source of truth."],
  ["A shared view for teams and owners", "Salespeople work with leads permitted to them. Managers can review team activity and progress; company owners and organization administrators have broader organization-level views subject to configured permissions."],
  ["Our product approach", "Adometa focuses on productivity, transparency and useful customer relationships: keep context connected to the work, make the next action visible, and protect access with role and organization boundaries. Product capabilities and external integrations remain dependent on configuration."],
];

export function AboutPage() {
  return <div className="marketing-page"><PublicHero eyebrow="ABOUT ADOMETA" title="A practical workspace for better-managed sales conversations." description="Adometa CRM is a customer relationship management workspace focused on organizing incoming leads and the actions teams take next." /><div className="about-grid">{aboutSections.map(([title, body]) => <article className="about-card" key={title}><h2>{title}</h2><p>{body}</p></article>)}</div><section className="marketing-callout"><div><h2>Productivity without unsupported promises</h2><p>Adometa describes capabilities present in the current CRM; it does not rely on invented customer counts, awards or performance claims.</p></div><a className="button secondary" href="/features">Explore features</a></section></div>;
}

const initialContact: PublicContactSubmission = { fullName: "", mobile: "", email: "", company: "", subject: "", message: "" };

export function ContactPage() {
  const [form, setForm] = useState(initialContact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const idempotencyKey = useRef(crypto.randomUUID());
  const validity = validatePublicContact(form);
  const isValid = Object.values(validity).every(Boolean);

  const change = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.currentTarget;
    setForm((current) => ({ ...current, [name]: value }));
    setError("");
    setSuccess("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) {
      setError("Check the highlighted details and complete all required fields.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const website = String(new FormData(event.currentTarget).get("website") ?? "");
      const saved = await submitPublicContact(form, idempotencyKey.current, website);
      setSuccess(`Your enquiry was recorded as new on ${new Date(saved.createdAt).toLocaleString()}. WhatsApp has not been notified automatically.`);
      idempotencyKey.current = crypto.randomUUID();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your enquiry could not be saved. You can use the manual WhatsApp option below.");
    } finally { setBusy(false); }
  };

  return <div className="marketing-page">
    <PublicHero eyebrow="CONTACT ADOMETA" title="Tell us what your team needs to manage." description="Share a little about your sales workflow. A successful form submission is saved with a timestamp and status; WhatsApp remains an optional manual follow-up." />
    <div className="contact-layout"><form className="card contact-form" onSubmit={(event) => void submit(event)} noValidate>
      <div className="contact-form-heading"><h2>Send an enquiry</h2><p>Fields marked required must be completed.</p></div>
      <div className="contact-field-grid">
        <label>Full name <span aria-hidden="true">*</span><input name="fullName" autoComplete="name" required maxLength={120} value={form.fullName} onChange={change} aria-invalid={!validity.fullName && form.fullName.length > 0} /></label>
        <label>Mobile number <span aria-hidden="true">*</span><input name="mobile" type="tel" inputMode="tel" autoComplete="tel" required maxLength={24} placeholder="+91 91615 33353" value={form.mobile} onChange={change} aria-invalid={!validity.mobile && form.mobile.length > 0} /></label>
        <label>Email address <span aria-hidden="true">*</span><input name="email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={change} aria-invalid={!validity.email && form.email.length > 0} /></label>
        <label>Company name <span className="optional">(optional)</span><input name="company" autoComplete="organization" maxLength={160} value={form.company} onChange={change} aria-invalid={!validity.company} /></label>
      </div>
      <label>Subject <span aria-hidden="true">*</span><input name="subject" required maxLength={160} value={form.subject} onChange={change} aria-invalid={!validity.subject && form.subject.length > 0} /></label>
      <label>Message <span aria-hidden="true">*</span><textarea name="message" required minLength={10} maxLength={4000} rows={6} value={form.message} onChange={change} aria-invalid={!validity.message && form.message.length > 0} /></label>
      <label className="contact-honeypot" aria-hidden="true">Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
      {error && <p className="form-feedback form-error" role="alert">{error}</p>}
      {success && <p className="form-feedback form-success" role="status">{success}</p>}
      <button className="button primary contact-submit" disabled={busy || !isValid || Boolean(success)}>{busy ? "Submitting securely..." : success ? "Enquiry submitted" : "Submit enquiry"}</button>
      <p className="contact-privacy-note">Submitting sends the details above to Adometa's configured CRM database. Do not include passwords, payment details or other sensitive information.</p>
      {isValid && <div className="contact-manual-fallback"><p>WhatsApp is a manual alternative. This action opens a draft for you to review; it does not save the form in the CRM.</p><a className="button secondary manual-whatsapp" href={createWhatsAppUrl(createContactWhatsAppMessage(form))} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />Review and send this enquiry on WhatsApp</a></div>}
    </form>
    <aside className="contact-aside"><div className="contact-info-card"><span className="contact-info-icon"><MessageCircle size={19} /></span><h2>Prefer WhatsApp?</h2><p>Start a WhatsApp chat with Adometa. Your device will show the message so you can review and send it.</p><a className="button secondary" href={createWhatsAppUrl("Hello Adometa Team, I would like to enquire about Adometa CRM.")} target="_blank" rel="noopener noreferrer">Chat with Adometa</a><small>{ADOMETA_WHATSAPP_DISPLAY}</small></div><div className="contact-info-card"><span className="contact-info-icon"><ShieldCheck size={19} /></span><h2>What happens next?</h2><p>Website form submissions are stored as new enquiries. No WhatsApp Business API credentials or automatic notification integration are configured in this project.</p></div></aside></div>
  </div>;
}

const integrationItems = [
  ["Google Sheets", "A server-side synchronization path exists for importing leads. A platform administrator must configure OAuth credentials and connect an organization sheet before it is usable."],
  ["WhatsApp", "The CRM creates user-initiated click-to-chat links. It does not send Business API messages or report delivered/read status."],
  ["Meta Lead Ads", "The webhook code exists, but Meta Lead Ads is intentionally disabled until the provider setup and secrets are approved."],
  ["Payments", "Billing records and payment hardening exist, but YouPI and QR production payments remain disabled."],
  ["Calling", "The calling workspace uses the device dialer and records an outcome manually. No telephony provider is configured."],
];

export function IntegrationsPage() {
  return <div className="marketing-page"><PublicHero eyebrow="INTEGRATIONS" title="Know what is connected before you rely on it." description="Integration code and enabled provider connections are different. The current project state is described below; each external service requires its own setup." /><div className="integration-list">{integrationItems.map(([name, description]) => <article className="integration-detail" key={name}><span className="integration-state">Configuration required or limited</span><h2>{name}</h2><p>{description}</p></article>)}</div></div>;
}

const faqs = [
  ["What is Adometa CRM?", "A shared sales workspace for organizing lead records, ownership, activity, follow-ups and configured sales operations."],
  ["Does Adometa automatically call or message leads?", "No. Calls use your device dialer and must be placed by a user. WhatsApp features open a click-to-chat conversation for the user to review and send; a WhatsApp Business API is not configured."],
  ["Can salespeople see every organization's leads?", "No. Access is intended to be restricted by organization membership, role authorization and Supabase row-level security."],
  ["Which integrations are currently usable?", "Google Sheets has a server-side integration path but requires provider setup. Meta Lead Ads and production payment providers are not enabled. Contact Adometa to confirm your deployment configuration."],
  ["How do I find current prices?", "The pricing page loads active plan records from the configured backend. Contact the team to confirm payment terms, taxes and checkout availability."],
  ["How do I contact Adometa?", `Use the contact form or start a manual WhatsApp chat at ${ADOMETA_WHATSAPP_DISPLAY}.`],
];

export function FaqPage() {
  return <div className="marketing-page"><PublicHero eyebrow="FAQ" title="Answers about the current product." description="These answers describe the code and enabled workflows in this project. Provider availability depends on deployment configuration." /><div className="faq-list">{faqs.map(([question, answer]) => <details className="faq-item" key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></div>;
}

const legalContent: Record<string, { eyebrow: string; title: string; intro: string; sections: Array<[string, string]> }> = {
  "/privacy": {
    eyebrow: "PRIVACY INFORMATION — REVIEW REQUIRED",
    title: "Privacy information",
    intro: "This product-level summary reflects features visible in the Adometa CRM project. It is not a substitute for a reviewed privacy notice. The operating company, contact address, lawful bases, retention periods and applicable jurisdiction must be confirmed before production use.",
    sections: [
      ["Information entered into CRM", "Organizations and their users may store lead contact details, company information, notes, tasks, call outcomes and other sales records. Access is intended to be scoped by organization membership, role permissions and database policies."],
      ["Website enquiries", "The contact form sends the name, mobile, email, optional company, subject and message to the configured backend for recording as an enquiry. Do not submit passwords, payment data or other sensitive information."],
      ["Authentication and essential storage", "Supabase provides account authentication. The browser client is configured to persist an authentication session and refresh it. The current code does not establish a marketing analytics or advertising-cookie service."],
      ["External providers", "Google Sheets, Supabase, hosting and any enabled communication providers may process information when configured. The exact deployed provider list and data locations need operator confirmation."],
      ["Retention and requests", "The project does not define a public retention schedule or privacy-request workflow. The service operator must publish contact details, retention rules and a process for access, correction and deletion requests before launch."],
    ],
  },
  "/terms": {
    eyebrow: "SERVICE INFORMATION — REVIEW REQUIRED",
    title: "Terms of service information",
    intro: "This page describes the product scope only and is not a completed contract. A qualified reviewer must approve the contracting entity, commercial terms, service levels, acceptable-use rules, liability and governing-law clauses before production use.",
    sections: [
      ["Product scope", "Adometa CRM provides configured tools for lead management, sales activity, role-scoped workspaces and related operations. Features may depend on plan records, permissions, integrations and deployment settings."],
      ["Accounts and organization access", "Users should use their own authorized accounts and follow their organization's access policies. Administrators are responsible for assigning roles and managing access for their organization."],
      ["Integrations and payments", "External provider connections require separate configuration and may be unavailable. WhatsApp links are user-initiated. Production YouPI and QR payment processing are not enabled by this project."],
      ["Commercial terms", "Current prices, billing periods, taxes, cancellation, refunds and payment availability must be confirmed directly with Adometa. Plan configuration alone does not confirm a checkout or payment."],
      ["Required pre-launch review", "The service operator must add a legal contracting entity, effective date, support contact, acceptable-use rules, security responsibilities and jurisdiction-specific legal terms before treating this page as binding."],
    ],
  },
  "/cookies": {
    eyebrow: "COOKIE AND STORAGE INFORMATION",
    title: "Cookie and browser storage information",
    intro: "The current code uses essential browser storage for Supabase authentication persistence. This page does not claim that a consent manager or a complete jurisdiction-specific cookie compliance process is configured.",
    sections: [
      ["Essential authentication storage", "The browser Supabase client is configured to persist the signed-in session and refresh tokens. This supports sign-in and protected workspace access."],
      ["No configured advertising analytics", "A review of the current application source found no marketing analytics or advertising cookie integration. External fonts may be requested from Google Fonts when the page loads."],
      ["Manage browser data", "You can clear site storage using your browser settings; doing so signs you out and may require signing in again. Clearing storage does not delete CRM records stored by the organization."],
      ["Operator review", "Before production use, confirm the deployed providers, cookie behavior, required consent rules and the operator contact for privacy requests."],
    ],
  },
};

export function LegalPage({ path }: { path: string }) {
  const page = legalContent[path] ?? legalContent["/privacy"];
  return <div className="marketing-page legal-page"><PublicHero eyebrow={page.eyebrow} title={page.title} description={page.intro} /><div className="legal-sections">{page.sections.map(([title, body]) => <section key={title}><h2>{title}</h2><p>{body}</p></section>)}</div><p className="legal-review">Draft product information only. Confirm deployment-specific facts and obtain appropriate legal review before launch.</p></div>;
}

export function PublicPage({ path }: { path: string }) {
  if (path === "/") return <HomePage />;
  if (path === "/features") return <FeaturesPage />;
  if (path === "/pricing") return <PricingPage />;
  if (path === "/about") return <AboutPage />;
  if (path === "/contact") return <ContactPage />;
  if (path === "/integrations") return <IntegrationsPage />;
  if (path === "/faq") return <FaqPage />;
  if (path === "/privacy" || path === "/terms" || path === "/cookies") return <LegalPage path={path} />;
  return <div className="marketing-page"><PublicHero eyebrow="PAGE NOT FOUND" title="This page is not available." description="Check the address or return to the Adometa home page." /><a className="button primary" href="/">Go to home</a></div>;
}
