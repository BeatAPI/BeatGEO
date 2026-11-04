# AI traffic and crawl sources

Use **Brand → Website brand** to connect Google and select sites. **SEO → Search performance** shows GSC search queries, clicks, impressions and rankings. **GEO → AI Traffic & Crawls** shows GA-attributed human visits and imported crawler requests; **Answer Engine Insights** shows answer mentions/citations. These sources stay separate. A website URL alone does not provide private traffic history.

## Connect existing GA

The local release includes BeatGEO's public Google Desktop OAuth client pair. Users run `pnpm start` and click **Continue with Google**; they do not create a Google project or edit ENV. The maintainer enables Search Console, Analytics Admin and Analytics Data APIs and maintains Google's publication/verification requirements once. See the [release checklist](google-oauth-release.md). Public production status does not by itself mean Google verification has passed.

Hosted deployments instead configure a separate Web application client with private `GA_CLIENT_ID` and `GA_CLIENT_SECRET`, registering `${APP_URL}/api/traffic/google/callback` on HTTPS. Existing individual connection endpoints use `/api/traffic/ga/callback` and `/api/traffic/gsc/callback`. Keep `APP_URL` consistent with the browser origin and preserve the existing encryption key.

A user clicks **Continue with Google**, grants the requested read-only Search Console and Analytics permissions, returns to BeatGEO, selects a readable property and clicks **Read GA data**. Partial permission grants connect only the approved service. Later **Refresh GA data** reuses the grant until it is revoked or expires. There is no background schedule and no additional analytics script. An existing Google browser session does not itself grant the product API access.

The connection and latest snapshot belong to the brand and are accessible through its existing organization permissions. Credentials use the workspace's existing encryption with brand-bound context, stay on the server and are excluded from page data. The OAuth callback is bound to the initiating user/session, state and PKCE, expires after ten minutes and returns only a fixed status. Disconnect removes the local grant and GA snapshot; Google-side revocation can also be performed in the user's Google account connections.

The page reads the last 28 completed calendar days in the GA property timezone, restricted to the brand's exact primary hostname. `www` and other subdomains are separate; the GA property must collect that hostname. Reconnecting lets the user change property. The source-domain catalogue supplements Google's native AI Assistant channel for referrals such as Doubao. Custom `AI Traffic` labels and brand-name substrings alone are not sufficient classification evidence.

Sessions are not unique users; key events reflect the property's configuration and do not establish verified purchases. Landing and source tables are separate views and are not added together. Known bots excluded by GA, missing referrers, blocked scripts, no-click exposure and Google AI Overviews/AI Mode cannot be reconstructed. Sampling, thresholding, high-cardinality grouping and other GA restrictions remain flagged; failed reads preserve the last successful snapshot rather than overwriting it with zero.

## Import crawler logs

Upload a site-specific Nginx/Apache Combined log, the documented JSON envelope/record array or JSONL (10 MiB / 50,000 rows maximum). JSON records use `time`, `host` (optional only for a single-site log), `path`, `method`, numeric `status`, and `userAgent`. Arbitrary CDN export formats may need conversion. JSONL/NDJSON filenames are recognized automatically. Each successful import replaces the previous snapshot; do not add overlapping imports together.

Identity is based on 11 documented User-Agent declarations across OpenAI, Anthropic, Perplexity and Kimi and remains unverified. Search, training and user-triggered purposes remain distinct. Coverage is unknown; a request does not prove indexing, training or answer citation. The import omits IPs, full UAs, referrers and URL query strings before persistence. Up to 200 request evidence rows and 30 rejection reason codes are retained alongside full aggregate counts. Tables preview up to 100 rows. Entirely invalid imports preserve the existing snapshot.

## Storage and acceptance

Migration `0028_brand_data_sources.sql` adds one table to the existing PostgreSQL database; no Redis, queues, new external store or upstream deployment workflow is introduced. It is included for the normal reviewed migration process. Existing user databases were not migrated during implementation. Integration tests use only a disposable local database ending in `_test`.

Unit/mock tests cover attribution, pagination, data limits, log privacy, OAuth expiry/state/session binding, grant encryption and brand-access gates. Storybook covers empty, connected, populated and Chinese/mobile states. Real Google consent, property discovery and Data API reads succeeded with the release desktop client on 2026-11-03; Google verification remains pending. All committed fixtures are synthetic; no raw account analytics or user credentials are included.

Official references: [Web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Data API](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport), [GA channels](https://support.google.com/analytics/answer/9756891?hl=en).

## Connect Search Console

Search Console and GA use the shared **Continue with Google** flow. Select an accessible Search Console domain or URL-prefix property and read the search data. Property scope is Google's scope for the selected property and may include more than the brand hostname. Choose carefully; a Google account may access several unrelated sites.

The connection and latest result are stored with the brand using the existing encrypted credential store. Refresh is manual; disconnect deletes the local grant and snapshot, and the Google account connections page can revoke the grant at Google. Results cover the 28-day window ending four UTC calendar days before the read to allow for reporting delay. Google Search web clicks, impressions, CTR and average position are not AI answer mentions or AI-referral traffic. Missing data is not zero. Google can omit anonymized queries and return only top rows; the application stops at 10,000 page rows and 10,000 query rows. It cannot promise all keywords. Failed reads leave the last successful snapshot intact.

Real Google OAuth authorization, property listing and Search Console reads succeeded with the release desktop client on 2026-11-03; automated tests use synthetic responses. The local release supplies the client configuration, while each user grants their own consent. Google's app verification remains a separate maintainer responsibility. User tokens, Web application secrets and live analytics must not be committed. The installed-app public-client pair is deliberately distributed with the local release.
