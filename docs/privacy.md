# BeatGEO privacy and local data

This describes the open-source MVP, not terms for a hosted service.

## Google Search Console and Google Analytics

Connecting Google is optional. BeatGEO requests read-only access to Search Console and Analytics so you can select properties and view search performance and AI-referral traffic in your local workspace. The connection does not grant permission to change your Google properties, publish content, or administer your Google account.

Google handles account sign-in and consent. Your local BeatGEO service exchanges the authorization code directly with Google and requests the properties and reports you choose. OAuth access and refresh tokens are encrypted in your local PostgreSQL database with your installation's private encryption key. Selected properties and the latest report snapshots are also stored locally. The public OAuth client ID identifies BeatGEO; it is not your personal token.

The Google connection does not send your tokens or report snapshots to a BeatGEO-hosted database, sell them, use them for advertising, or use them to train general-purpose AI models. Optional research providers receive inputs for the research actions you initiate; connecting Google alone does not initiate such research. If you export or share report data, you control where that copy goes.

The latest successful report is retained until replaced, disconnected, or deleted with the local workspace. **Disconnect** removes that service's local tokens, selected property and snapshot; it does not delete Google-side data or copies in your backups. You can revoke BeatGEO's access through [Google account connections](https://myaccount.google.com/connections). Revoking the shared Google grant may disconnect both services. Keep local backups and encryption keys private; removing a local connection does not remove backup copies.

BeatGEO's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its Limited Use requirements. For privacy questions, contact **support@beatapi.io**. Do not include credentials or raw analytics in public GitHub issues.

## Other local data

The collector binds to loopback, validates Host/Origin and checks a local token for submissions. BeatBrowser uses the selected Chrome profile. Cookies are not exported; the target website receives questions through that account.

Private evidence contains prompts, answers, links, errors and browser handles. It is gitignored and stored with private permissions in `.beat-geo/runs/`. If the new directory does not exist, existing `.open-profound/runs/` remains readable without moving or deleting data. `BROWSER_RUNS_DIR` explicitly overrides the location. Legacy token headers remain accepted; new callers use `x-beat-geo-token` or bearer authentication.

Full-product accounts and tasks live in the operator's PostgreSQL deployment. Website sessions and BeatAPI balances are separate credentials. BeatGEO sends no product analytics or telemetry. Data leaves the computer only for the services you configure: BeatAPI requests, Google Search Console/Analytics reads and the AI websites opened in your own Chrome.

Stored credentials are encrypted with `BEAT_GEO_ENCRYPTION_KEY`; during a rotation, previous keys stay readable through `BEAT_GEO_ENCRYPTION_KEY_OLD`. Legacy encryption variable names remain readable for existing installations. Back up the workspace and keep the key with it.
