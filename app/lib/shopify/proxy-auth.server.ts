/**
 * Shopify App Proxy signature validation.
 *
 * Every request forwarded through Shopify's App Proxy includes a `signature`
 * query parameter. This signature is HMAC-SHA256 of all OTHER query parameters
 * (sorted, joined as "key=value" pairs, no separator) using the app's API secret.
 *
 * Docs: https://shopify.dev/docs/apps/build/online-store/app-proxies#security
 *
 * Call validateProxySignature() at the top of every public API route that will
 * be accessed through the App Proxy. Requests not coming through the proxy will
 * fail this check and should be rejected.
 */

import crypto from "node:crypto";
import { env } from "~/config/env";

/**
 * Validates the Shopify App Proxy HMAC signature on an incoming request.
 *
 * @param request — the incoming Remix/Node Request object
 * @returns true if the signature is valid
 */
export function validateProxySignature(request: Request): boolean {
  const url = new URL(request.url);
  return validateFromSearchParams(url.searchParams);
}

/**
 * Validates from a URLSearchParams object directly (useful in tests and loaders
 * where the full Request may not be available).
 */
export function validateFromSearchParams(searchParams: URLSearchParams): boolean {
  const signature = searchParams.get("signature");
  if (!signature) return false;

  const pairs: string[] = [];
  for (const [key, value] of searchParams.entries()) {
    if (key !== "signature") {
      pairs.push(`${key}=${value}`);
    }
  }
  pairs.sort();

  const message = pairs.join("");
  const hmac = crypto
    .createHmac("sha256", env.SHOPIFY_API_SECRET)
    .update(message)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Extracts the shop domain from the proxy query parameter.
 * Returns null if the `shop` parameter is absent.
 */
export function extractShopFromProxy(request: Request): string | null {
  const url = new URL(request.url);
  return url.searchParams.get("shop");
}

/**
 * Returns true if this is a development environment where proxy signature
 * validation can be skipped (e.g. local testing without ngrok).
 */
export function isProxySignatureRequired(): boolean {
  return process.env.SKIP_PROXY_AUTH !== "true";
}
