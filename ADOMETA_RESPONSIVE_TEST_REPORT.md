# Adometa CRM Responsive Test Report

Audit date: 2026-11-14

## Test method and result

An integrated browser check exercised the public login page at 1440, 1024, 768, 390, and 320 CSS-pixel viewport widths. The test server used non-secret placeholder Supabase configuration and no authenticated account or staging data. No authenticated CRM screens were exercised.

| Viewport/workflow | Result | Evidence |
|---|---|---|
| Desktop navigation | PARTIAL | Public desktop navigation rendered at 1440px; authenticated profile/logout behavior remains untested. |
| Tablet public layout | PASS | Public page rendered at 1024px and 768px without document horizontal overflow. Authenticated dashboard screens remain untested. |
| Mobile public navigation | PASS | At 390px and 320px, the button measured 44×44px; opening showed navigation and Escape closed it. Authenticated drawer behavior remains untested. |
| Mobile tables | PARTIAL | Shared table wrapper supports horizontal scrolling; no card alternative for dense data. |
| Mobile forms/dialogs | PARTIAL | Public login form rendered; authenticated dialogs and virtual-keyboard behavior are not tested. |
| Pipeline on touch screens | BROKEN for touch drag | Movement UI depends on native drag-and-drop; a select fallback exists per lead card but is not a complete touch-optimized workflow. |
| Accessibility | NOT VERIFIED | No automated accessibility test or screen-reader/keyboard run. |
| Public login at 1440, 1024, 768, 390, 320px widths | PASS | Integrated browser check: `scrollWidth` equaled `clientWidth` at every tested width; mobile menu opened and closed with Escape. |

## Confirmed responsive foundations

- Global box sizing and minimum-width protections are present.
- Main content and dashboard grids adapt at 1050px and 720px.
- Mobile menu button and off-canvas sidebar are present; public menu has a 44×44px hit area and Escape close.
- Tables have a horizontal overflow wrapper.
- Modal uses viewport padding and bounded width; lead details have bounded height and scrolling.
- Common card grids and some forms switch to one column on narrow screens.

## Issues to address

1. Add focus management and test close-on-navigation for the accessible drawer. Escape close and a mobile sign-out action are present.
2. Desktop profile menu and mobile sign-out action were added; verify them in authenticated browser sessions.
3. Prevent horizontal page overflow for long names, organization labels, inputs, pipeline columns and report toolbars.
4. Add responsive card alternatives or explicitly labelled horizontal scrolling for high-value admin and CRM tables.
5. Replace drag-only interactions with keyboard- and touch-operable controls and ensure drop columns fit small screens.
6. Verify dialogs with virtual keyboards and short viewports; forms currently rely on CSS-only sizing.
7. Audit loading, empty, retry and validation states at narrow widths.

## Required runtime QA

Run authenticated browser tests at 1440x900, 1024x768, 768x1024, 390x844 and 320x700 for logout, workspace navigation, lead create/search/details, pipeline movement, company management, reports, Sheets setup, platform tables and modal workflows. Check horizontal document overflow, keyboard navigation, focus visibility, target size, clipped dialogs and readable text. Record screenshots and actual browser results before marking responsive behavior COMPLETE.
