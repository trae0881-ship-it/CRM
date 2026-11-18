# Google Sheets integration

Status: **INTEGRATION FOUNDATION ONLY** until a real Google OAuth authorization and spreadsheet read test succeeds.

Supabase's free tier can host the database and Edge Functions for a small/manual integration, within its current quotas. A paid Supabase plan is not inherently required to connect and manually sync a sheet. Google still requires a Google Cloud project and OAuth client; Supabase does not provide those credentials. Google API quotas and OAuth consent/verification requirements are separate from Supabase pricing.

## Server configuration

Configure these only in Supabase Edge Function secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte key)
- `GOOGLE_SHEETS_SYNC_CRON_SECRET` (random scheduler-only secret)

The OAuth callback URI is derived from the incoming `google-sheets-oauth` Edge Function request. Do not configure an app route or a `GOOGLE_SHEETS_REDIRECT_URI` secret. Register the exact deployed function URL as an authorized redirect URI in Google Cloud.

## First-time setup

1. Apply the existing database migrations through `202611020019_google_sheets_and_pipeline_access.sql` in the intended Supabase project. Do not recreate the integration tables.
2. In Google Cloud Console, enable the Google Sheets API, configure the OAuth consent screen, and create a Web application OAuth client. Add the Google account used for testing as a test user while the consent screen is in testing.
3. Register the exact callback URL `https://<project-ref>.supabase.co/functions/v1/google-sheets-oauth` as an authorized redirect URI on the Google OAuth Web client. The function derives this URI from its own request URL; it does not redirect to `crm.adometa.in` or an organization route.
4. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY` as Supabase Edge Function secrets. Keep the client secret and encryption key server-side; never add them to frontend environment variables. `GOOGLE_SHEETS_SYNC_CRON_SECRET` is optional unless a trusted scheduler is configured.
5. Deploy `google-sheets-oauth` with JWT gateway verification disabled so Google's callback can reach it: `supabase functions deploy google-sheets-oauth --no-verify-jwt`. Its POST actions still validate the user's bearer token and organization-admin membership in the function; the callback validates a one-time, expiring OAuth state.
6. Deploy `google-sheets-sync` normally: `supabase functions deploy google-sheets-sync`. Apply migrations before testing. The browser sends the user's session token for manual sync.

For OAuth apps used outside their test users, Google may require consent-screen verification for requested scopes. A Supabase free plan does not remove that Google requirement. Manual sync does not require a scheduler; automatic sync requires separately configured trusted scheduling.

## Troubleshooting: "Failed to send a request to the Edge Function"

The Google provider shown under Supabase Auth → Sign In / Providers is for Supabase user sign-in. It does not host or deploy the Google Sheets integration functions.

1. In Supabase Dashboard → Edge Functions, confirm both `google-sheets-oauth` and `google-sheets-sync` are deployed to the same project whose URL is built into `VITE_SUPABASE_URL`.
2. Deploy the current function source, which handles browser `OPTIONS`/CORS preflight requests. For example, with the Supabase CLI linked to the correct project:
   - `supabase functions deploy google-sheets-oauth --no-verify-jwt`
   - `supabase functions deploy google-sheets-sync`
3. Check `google-sheets-oauth` logs while clicking Connect. A browser/network failure usually occurs before Google OAuth starts; missing Google credentials instead return a function error such as a missing secret.
4. Confirm the three required Google secrets are configured in that project's Edge Function secrets, the database migration exists, and the callback URL is registered exactly in the Google Cloud OAuth client.

Do not share service-role keys, Google client secrets, OAuth codes, or access/refresh tokens when reporting an error.

The client never receives refresh tokens. The sync function validates the authenticated membership, decrypts the server-side token, reads the configured worksheet, performs organization-scoped upserts, keeps source-row mappings, preserves CRM-managed fields, records missing source rows without deleting CRM leads, and writes sync history.

Google Drive/Sheets access errors, expired tokens and invalid rows are surfaced as errors. Automatic scheduling requires a trusted scheduler to invoke `google-sheets-sync` with `x-google-sync-cron-secret` and each eligible integration ID. Configure Supabase Cron, an authenticated server cron, or Hostinger cron to call the Edge Function; frontend polling is not used as the synchronization mechanism.

Meta Lead Ads remains **Coming Soon — Not Connected** and is intentionally not implemented in this phase.
