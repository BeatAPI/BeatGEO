# Google connection: maintainer release checklist

The release target is for ordinary users to download BeatGEO, run `pnpm start`, open their website workspace, and click **Continue with Google**, without creating a Google Cloud project or editing ENV. Local storage and application encryption secrets are generated automatically; the Google Desktop public-client pair ships with the application. No user-supplied Google configuration is required in local mode.

## One-time maintainer setup

Use the existing BeatAPI Google Cloud project (`beatapi`). BeatGEO has its own Desktop app client under the shared BeatAPI consent brand; keep the existing BeatAPI Web application client unchanged.

1. Enable Google Search Console API (`searchconsole.googleapis.com`), Google Analytics Admin API (`analyticsadmin.googleapis.com`) and Google Analytics Data API (`analyticsdata.googleapis.com`).
2. Configure OAuth branding as BeatAPI with an accurate support contact, application home page and privacy policy. Select External audience for users outside the organization.
3. Configure only `https://www.googleapis.com/auth/webmasters.readonly` and `https://www.googleapis.com/auth/analytics.readonly` for this data connection.
4. Create an OAuth client of type **Desktop app**. Put its public installed-app client ID and client secret in `apps/web/src/server/google-client-release.json`. The Google Cloud project owner maintains this once; users do not supply it. Google classifies desktop apps as public clients that cannot keep this pair confidential; PKCE and per-user consent protect authorization. Custom desktop client overrides must supply their own matching pair. Do not add a web client secret, access token or refresh token to the repository.
5. Publish the audience to production as requested by the product owner. Complete any Google brand/scope verification before describing the application as verified or available without warnings/limits. Production publishing alone does not establish verification.

Google supports loopback redirects for desktop applications, including localhost; the app uses its actual APP_URL and port. The browser must open that same origin so the session-bound callback cookie is present. Do not embed authorization in an iframe or webview. Hosted deployment uses a separate Web application client and private server credentials instead.

## Acceptance before claiming the flow complete

- Fresh download: `pnpm start` creates unique configuration and dedicated storage; restart reuses both. Existing data or partial configuration never triggers automatic key replacement.
- The button opens Google's account/consent page with the correct BeatAPI branding and both read-only scopes; cancelling changes nothing.
- Granting both permissions returns to the same brand and lists readable GSC/GA properties. Partial consent accurately shows the connected service only.
- Selecting a property and reading data succeeds with the real account. Google data snapshots stay distinct from SEO estimates and AI answer observations.
- Expired access tokens refresh successfully; changed OAuth clients require reconnecting. A web secret must not be requested for the desktop flow. If Google rejects a registered client's token exchange, investigate the client type and documented requirements before distributing credentials or introducing a hosted relay.
- Wrong sessions, changed states, expired callbacks and lost brand access cannot save credentials. Grants are encrypted per brand/service and never returned to browser page data.
- Reconnecting resets selected properties/snapshots for the services granted in that attempt. Disconnect removes only the selected local service; Google-side revocation may affect all grants for the application.

Sources: [Google desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Google project and brand guidance](https://developers.google.com/identity/siwg/best-practices), [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies).

## Full verification submission

Production audience and Google verification are separate. An unverified production application can still show a warning and be subject to Google's unverified-user cap.

1. Publish an accurate product homepage and privacy policy on the same domain. Link the policy from the homepage, and verify domain ownership in Search Console using an account that is an owner or editor of the Cloud project. The repository privacy document is an interim public reference, not evidence that Google's website requirements are met. A GitHub repository does not grant ownership of `github.com`.
2. In Google Auth Platform → Branding, verify and publish the BeatAPI brand. The app name is **BeatAPI** and the desktop client name is **BeatGEO**. Resolve Google's automated website/domain findings before requesting data-access verification.
3. In Data Access, request only the two read-only scopes. Explain that Analytics Admin lists the user's properties and Analytics Data reads the selected property's referral reports; write permissions are unnecessary. The console currently classifies `analytics.readonly` as sensitive and `webmasters.readonly` as non-sensitive.
4. Record a real English-language walkthrough: start BeatGEO, show the Google connection button, the complete consent screen and browser URL/client ID, grant the requested scopes, select GSC and GA properties, read the reports, then show disconnect. Include the unverified warning if it appears. Use appropriate demonstration data; do not expose tokens or unrelated private analytics. Upload as an unlisted YouTube video and provide the actual link.
5. Open Verification Center → Prepare for verification, complete the requested declarations and submit. Respond to Google's review emails. A submission receipt is not approval; confirm the approved brand and data-access statuses before claiming verification.

As of 2026-11-03, project `beatapi` uses the BeatAPI consent brand and a separate BeatGEO Desktop client. The audience is production and all three Google APIs are enabled. The desktop public-client pair is bundled for local loopback use; hosted deployments still require their own private Web application credentials. User access/refresh tokens and local encryption keys are never distributed.

Real Google authorization, GSC/GA property listing, Search Console search performance and GA4 referral reports succeeded with the maintainer's account. The combined demonstration was submitted with a homepage-ownership appeal. Google Verification Center confirms that the brand and data access are under review; approval is still pending. Keep the existing shared privacy policy and terms links. This is not a claim that every operating system or a fresh user's Google account has been tested.

Reference: [Google sensitive-scope verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).
