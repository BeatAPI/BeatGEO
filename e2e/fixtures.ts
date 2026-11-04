/**
 * Shared E2E fixture constants — the single place the seeder, auth setup, and
 * Playwright specs agree on IDs and credentials. Unlike seed.ts this module
 * has no side effects, so specs can import from it freely.
 */
import path from "node:path";

/** Directory this file lives in, so paths don't depend on the caller's cwd. */
const E2E_DIR = import.meta.dirname;

// The seeder also validates overrides before connecting.
function databaseUrl(name: string): string {
  return `postgres://postgres:postgres@localhost:5432/${name}`;
}

// The env override lets CI workflows pass their own credentials (e.g.
// `beatgeo`/`beatgeo` for the scheduling-policy job's postgres service) — the first
// one to set DATABASE_URL in a given step wins.
export const DATABASE_URL = process.env.DATABASE_URL ?? databaseUrl("beatgeo_test");

// Must match ADMIN_API_KEYS in the isolated stack and bruno/environments/local.bru.
export const TEST_API_KEY = "test-api-key-e2e";

export const TEST_USER = {
  email: "e2e@test.local",
  name: "E2E Test User",
} as const;

export const TEST_BRAND_ID = "default";
export const TEST_ORG_SLUG = "default";

export function organizationUrl(org: string = TEST_ORG_SLUG): string {
  return `/app/org/${org}`;
}

export function brandUrl(brand: string = TEST_BRAND_ID, org: string = TEST_ORG_SLUG): string {
  return `${organizationUrl(org)}/brand/${brand}`;
}
export const TEST_BRAND_NAME = "Test Organization";


export const SLUGGED_BRAND_ID = "seeded-slug-brand";
export const SLUGGED_BRAND_SLUG = "labs";
export const SLUGGED_BRAND_NAME = "Test Labs";

export const RENAMEABLE_BRAND_ID = "seeded-rename-brand";
export const RENAMEABLE_BRAND_SLUG = "rename-me";
export const RENAMEABLE_BRAND_NAME = "Test Rename";
export const TEST_BRAND_WEBSITE = "https://example.com";

export const PROMPT_IDS = {
  branded1: "00000000-0000-0000-0000-000000000001",
  branded2: "00000000-0000-0000-0000-000000000002",
  unbranded1: "00000000-0000-0000-0000-000000000003",
  branded3: "00000000-0000-0000-0000-000000000004",
  unbranded2: "00000000-0000-0000-0000-000000000005",
} as const;

export const COMPETITOR_IDS = {
  competitorA: "00000000-0000-0000-0000-100000000001",
  competitorB: "00000000-0000-0000-0000-100000000002",
} as const;

export const REPORT_IDS = {
  completed: "00000000-0000-0000-0000-300000000001",
  pending: "00000000-0000-0000-0000-300000000002",
  processing: "00000000-0000-0000-0000-300000000003",
  failed: "00000000-0000-0000-0000-300000000004",
} as const;

// Second tenant — a brand in an org the E2E user is NOT a member of.
export const NIKE_ORG_ID = "nike";
export const NIKE_BRAND_ID = "nike";
/** In the tenant the E2E user cannot see, so no dashboard spec's list changes. */
export const NIKE_SECOND_BRAND_ID = "nike-jordan";
export const NIKE_PROMPT_IDS = {
  training: "00000000-0000-0000-0000-400000000001",
  lifestyle: "00000000-0000-0000-0000-400000000002",
} as const;
export const NIKE_COMPETITOR_IDS = {
  adidas: "00000000-0000-0000-0000-410000000001",
  puma: "00000000-0000-0000-0000-410000000002",
} as const;

/** One key per access pattern, seeded straight into `apikey` so the suite needs
 * no session. */
export const API_SCOPES = ["read", "write"] as const;

export type ApiScope = (typeof API_SCOPES)[number];


export interface ApiKeyFixture {
  token: string;
  name: string;
  organizationId: string;
  scopes: readonly ApiScope[];
  brandIds: readonly string[] | null;
  enabled?: boolean;
  expiresInMs?: number;
}

export const API_KEYS = {
  orgFull: {
    token: "beatgeo_e2e_org_full",
    name: "E2E org key (full)",
    organizationId: TEST_BRAND_ID,
    scopes: API_SCOPES,
    brandIds: null,
  },
  orgReadOnly: {
    token: "beatgeo_e2e_org_readonly",
    name: "E2E org key (read-only)",
    organizationId: TEST_BRAND_ID,
    scopes: ["read"],
    brandIds: null,
  },
  orgNoScopes: {
    token: "beatgeo_e2e_org_no_scopes",
    name: "E2E org key (no scopes)",
    organizationId: TEST_BRAND_ID,
    scopes: [],
    brandIds: null,
  },
  /** What a forged restriction looks like: the intersection empties it. */
  orgForgedRestriction: {
    token: "beatgeo_e2e_org_forged_restriction",
    name: "E2E org key (forged restriction)",
    organizationId: TEST_BRAND_ID,
    scopes: API_SCOPES,
    brandIds: [NIKE_BRAND_ID],
  },
  nikeFull: {
    token: "beatgeo_e2e_nike_full",
    name: "E2E Nike key (full)",
    organizationId: NIKE_ORG_ID,
    scopes: API_SCOPES,
    brandIds: null,
  },
  nikeNarrow: {
    token: "beatgeo_e2e_nike_narrow",
    name: "E2E Nike key (one brand)",
    organizationId: NIKE_ORG_ID,
    scopes: API_SCOPES,
    brandIds: [NIKE_BRAND_ID],
  },
  expired: {
    token: "beatgeo_e2e_expired",
    name: "E2E org key (expired)",
    organizationId: TEST_BRAND_ID,
    scopes: API_SCOPES,
    brandIds: null,
    expiresInMs: -60_000,
  },
  disabled: {
    token: "beatgeo_e2e_disabled",
    name: "E2E org key (revoked)",
    organizationId: TEST_BRAND_ID,
    scopes: API_SCOPES,
    brandIds: null,
    enabled: false,
  },
} as const satisfies Record<string, ApiKeyFixture>;

/** Where the local stack answers. `BASE_URL` overrides it for a one-off run. */
export const APP_URL = process.env.BASE_URL ?? "http://localhost:1515";

/** Where auth.setup.ts saves the authenticated browser state. */
export const AUTH_STATE_PATH = path.join(E2E_DIR, ".auth", "local.json");
