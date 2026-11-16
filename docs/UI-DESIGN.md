# Adometa CRM UI design specification

## Reference observations

The supplied Adometa Hostinger site uses Plus Jakarta Sans, a light slate background, dark navy authentication surfaces, indigo primary actions, lavender feature surfaces, thin borders, and rounded cards. The supplied NeoDove page uses a white/black high-contrast shell, Poppins typography, and yellow primary calls to action. Adometa's existing deployed brand is preserved: use its indigo and slate tokens, while following NeoDove's compact CRM hierarchy and direct-action emphasis rather than mixing unrelated brand colors.

## CRM application rules

- Use `Plus Jakarta Sans` for all product UI.
- Use `--adometa-brand` (`#5144e5`) as the primary action and active navigation color.
- Use navy (`#0d152b`) for secure authentication surfaces.
- Use `--adometa-canvas` (`#f8fafc`) and `--adometa-brand-soft` for application backgrounds.
- Use the `--adometa-*` design tokens for color, spacing, and radii; avoid new unrelated accent palettes.
- Use 10–16px radius cards, 1px `--adometa-border` borders, and restrained shadows.
- Keep labels compact, uppercase, and letter-spaced; use bold headlines with tight tracking.
- Keep primary actions visible at the end of page headers and full-width on mobile.
- Collapse navigation for mobile and use at least 44px touch targets for primary navigation controls.
- Use horizontally scrollable tables only where tabular information cannot become cards.
- Never use static metrics for configured Supabase environments. Pending integration states must be explicit.

## Applied surfaces

The existing shell and public authentication surfaces use the shared color aliases; the public mobile navigation has an explicit 44px hit area, expanded state, and Escape-key close behavior. Organization settings and activity are backed by tenant-scoped Supabase records and RLS. Authenticated screens still require real staging accounts for full visual and role-based verification.
