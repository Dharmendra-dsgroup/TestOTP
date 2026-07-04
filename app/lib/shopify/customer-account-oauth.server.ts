/**
 * Shopify Customer Account API — PKCE OAuth helpers.
 *
 * Used for logging in already-ENABLED customers on non-Plus stores.
 * Requires the store to have "New Customer Accounts" enabled in Shopify admin.
 *
 * Flow:
 *   1. buildLoginUrl() calls startOAuthFlow() → returns the authorize URL
 *   2. Browser → https://{shop}/account/oauth/authorize  (Shopify authenticates customer)
 *   3. Shopify → GET /api/auth/customer-callback?code=...&state=...
 *   4. exchangeCodeForToken() validates PKCE + gets access token
 *   5. Redirect customer to their account page (session cookie set during step 2)
 */

import crypto from "node:crypto";
import { getRedisClient } from "~/config/redis";
import { env } from "~/config/env";

const STATE_TTL = 600; // 10 minutes — covers slow auth flows
const STATE_PREFIX = "caa_state:";

export interface OAuthStateData {
  codeVerifier: string;
  nonce: string;
  shopDomain: string;
  returnTo: string;
  phone?: string;
  email?: string;
}

export function getCallbackUri(): string {
  return `${env.SHOPIFY_APP_URL.replace(/\/$/, "")}/api/auth/customer-callback`;
}

function generateCodeVerifier(): string {
  // 32 bytes → 43-char base64url string, within OAuth 2.0 PKCE spec
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest().toString("base64url");
}

function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

async function storeOAuthState(state: string, data: OAuthStateData): Promise<void> {
  await getRedisClient().set(
    `${STATE_PREFIX}${state}`,
    JSON.stringify(data),
    "EX",
    STATE_TTL
  );
}

export async function consumeOAuthState(state: string): Promise<OAuthStateData | null> {
  const raw = await getRedisClient().getdel(`${STATE_PREFIX}${state}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthStateData;
  } catch {
    return null;
  }
}

/**
 * Generates a PKCE state, stores it in Redis, and returns the Shopify
 * Customer Account API OAuth authorization URL.
 */
export async function startOAuthFlow(opts: {
  shopDomain: string;
  returnTo: string;
  phone?: string;
  email?: string;
}): Promise<string> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  const nonce = generateNonce();
  const redirectUri = getCallbackUri();

  await storeOAuthState(state, {
    codeVerifier,
    nonce,
    shopDomain: opts.shopDomain,
    returnTo: opts.returnTo,
    phone: opts.phone,
    email: opts.email,
  });

  const url = new URL(`https://${opts.shopDomain}/account/oauth/authorize`);
  url.searchParams.set("client_id", env.SHOPIFY_API_KEY);
  url.searchParams.set(
    "scope",
    "openid email https://api.customers.com/auth/customer.graphql"
  );
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

export interface CustomerTokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}

export async function exchangeCodeForToken(
  shopDomain: string,
  code: string,
  codeVerifier: string
): Promise<CustomerTokenSet | null> {
  try {
    const resp = await fetch(`https://${shopDomain}/account/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: env.SHOPIFY_API_KEY,
        redirect_uri: getCallbackUri(),
        code,
        code_verifier: codeVerifier,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[CAA OAuth] Token exchange HTTP ${resp.status}: ${body.slice(0, 300)}`);
      return null;
    }

    return resp.json() as Promise<CustomerTokenSet>;
  } catch (err) {
    console.error("[CAA OAuth] Token exchange error:", err);
    return null;
  }
}
