# Adometa CRM UI design specification

## Reference observations

The supplied Hostinger site uses Plus Jakarta Sans, a light slate background, dark navy authentication surfaces, vivid indigo/purple primary actions, lavender feature surfaces, thin low-contrast borders, and generous rounded corners. Its public workspace preview uses compact KPI cards, a simple pipeline view, short activity lists, and high-contrast hierarchy. On mobile, the header collapses to a compact navigation treatment and content stacks without horizontal overflow.

## CRM application rules

- Use `Plus Jakarta Sans` for all product UI.
- Use `#5144e5` as the primary action and active navigation color.
- Use navy (`#0d152b`) for secure authentication surfaces.
- Use `#f8fafc` and subtle lavender gradients for application backgrounds.
- Use 10–16px radius cards, 1px `#e7e9f2` borders, and restrained shadows.
- Keep labels compact, uppercase, and letter-spaced; use bold headlines with tight tracking.
- Keep primary actions visible at the end of page headers and full-width on mobile.
- Collapse the sidebar below 720px and preserve touch targets of at least 34px.
- Use horizontally scrollable tables only where tabular information cannot become cards.
- Never use static metrics for configured Supabase environments. Pending integration states must be explicit.

## Applied surfaces

The specification is applied to the existing shell, authentication screen, dashboard, lead table, campaigns, follow-ups, module placeholders, and Meta Lead Ads integration screen. Backend services, RLS, and webhook code remain unchanged.
