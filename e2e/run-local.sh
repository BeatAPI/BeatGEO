#!/usr/bin/env bash
# Run UI tests against an explicitly prepared, isolated local test stack.
set -euo pipefail
cd "$(dirname "$0")/.."
node --input-type=module <<'JS'
const local = new Set(['localhost', '127.0.0.1', '[::1]']);
try {
  const app = new URL(process.env.BASE_URL || '');
  const database = new URL(process.env.DATABASE_URL || '');
  if (!local.has(app.hostname) || !['http:', 'https:'].includes(app.protocol) ||
      !local.has(database.hostname) || !['postgres:', 'postgresql:'].includes(database.protocol) ||
      !decodeURIComponent(database.pathname).endsWith('_test')) throw new Error();
  const response = await fetch(app.origin, { signal: AbortSignal.timeout(5000), redirect: 'manual' });
  if (response.status >= 500) throw new Error();
} catch {
  console.error('Set BASE_URL to a running local test app and DATABASE_URL to its disposable local *_test database. Prepare E2E fixtures first. For isolated core regression, use pnpm test:mvp.');
  process.exit(1);
}
JS
exec pnpm --filter e2e test:e2e "$@"
