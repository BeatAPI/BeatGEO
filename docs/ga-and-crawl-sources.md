# AI traffic and crawl sources

The brand sidebar's **AI Traffic & Crawls** page keeps three different kinds of evidence separate: GA-attributed human visits, imported crawler requests, and the existing answer mentions/citations. A website URL alone does not provide private traffic history.

## Connect existing GA

The workspace maintainer configures one Google OAuth **Web application** client, enables the Analytics Admin and Data APIs, and sets `GA_CLIENT_ID` and `GA_CLIENT_SECRET` in the web server environment. Register the exact callback `${APP_URL}/api/traffic/ga/callback` (for example `http://localhost:3000/api/traffic/ga/callback` locally; use HTTPS for hosted instances). Keep `APP_URL` consistent with the origin users actually open. Use the existing `BEAT_GEO_ENCRYPTION_KEY`; do not publish credentials or put them in frontend variables. For external users, complete Google's required app publication/verification rather than requiring each user to create a client.

A user clicks **Connect Google Analytics**, consents to `analytics.readonly` in Google, returns to BeatGEO, selects a readable property and clicks **Read GA data**. Later **Refresh GA data** reuses the grant until it is revoked or expires. There is no background schedule and no additional analytics script. An existing Google browser session does not itself grant the product API access.

The connection and latest snapshot belong to the brand and are accessible through its existing organization permissions. Credentials use the workspace's existing encryption with brand-bound context, stay on the server and are excluded from page data. The OAuth callback is bound to the initiating user/session, state and PKCE, expires after ten minutes and returns only a fixed status. Disconnect removes the local grant and GA snapshot; Google-side revocation can also be performed in the user's Google account connections.

The page reads the last 28 completed calendar days in the GA property timezone, restricted to the brand's exact primary hostname. `www` and other subdomains are separate; the GA property must collect that hostname. Reconnecting lets the user change property. The source-domain catalogue supplements Google's native AI Assistant channel for referrals such as Doubao. Custom `AI Traffic` labels and brand-name substrings alone are not sufficient classification evidence.

Sessions are not unique users; key events reflect the property's configuration and do not establish verified purchases. Landing and source tables are separate views and are not added together. Known bots excluded by GA, missing referrers, blocked scripts, no-click exposure and Google AI Overviews/AI Mode cannot be reconstructed. Sampling, thresholding, high-cardinality grouping and other GA restrictions remain flagged; failed reads preserve the last successful snapshot rather than overwriting it with zero.

## Import crawler logs

Upload a site-specific Nginx/Apache Combined log, the documented JSON envelope/record array or JSONL (10 MiB / 50,000 rows maximum). JSON records use `time`, `host` (optional only for a single-site log), `path`, `method`, numeric `status`, and `userAgent`. Arbitrary CDN export formats may need conversion. JSONL/NDJSON filenames are recognized automatically. Each successful import replaces the previous snapshot; do not add overlapping imports together.

Identity is based on 11 documented User-Agent declarations across OpenAI, Anthropic, Perplexity and Kimi and remains unverified. Search, training and user-triggered purposes remain distinct. Coverage is unknown; a request does not prove indexing, training or answer citation. The import omits IPs, full UAs, referrers and URL query strings before persistence. Up to 200 request evidence rows and 30 rejection reason codes are retained alongside full aggregate counts. Tables preview up to 100 rows. Entirely invalid imports preserve the existing snapshot.

## Storage and acceptance

Migration `0028_brand_data_sources.sql` adds one table to the existing PostgreSQL database; no Redis, queues, new external store or upstream deployment workflow is introduced. It is included for the normal reviewed migration process. Existing user databases were not migrated during implementation. Integration tests use only a disposable local database ending in `_test`.

Unit/mock tests cover attribution, pagination, data limits, log privacy, OAuth expiry/state/session binding, grant encryption and brand-access gates. Storybook covers empty, connected, populated and Chinese/mobile states. A real Google OAuth client consent and Data API read still need acceptance with the deployment's registered client. All committed fixtures are synthetic; no raw account analytics or credentials are included.

Official references: [Web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Data API](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport), [GA channels](https://support.google.com/analytics/answer/9756891?hl=en).
