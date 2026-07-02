/**
 * Shopify Multipass token generation (Shopify Plus only).
 *
 * Multipass allows an app to authenticate a customer directly without requiring
 * them to enter a password. The flow:
 *   1. App calls generateMultipassToken() with customer data + shop's multipass secret
 *   2. Customer is redirected to: https://{shop}/account/login/multipass/{token}
 *   3. Shopify validates the token, creates/logs in the customer, and redirects
 *      to the return_to URL (defaults to /account)
 *
 * Multipass algorithm (from Shopify docs):
 *   hash          = SHA256(multipassSecret)
 *   encryptionKey = hash[0..15]   (first 16 bytes)
 *   signatureKey  = hash[16..31]  (last 16 bytes)
 *   iv            = random 16 bytes
 *   cipherText    = AES-128-CBC(customerJson, encryptionKey, iv)
 *   message       = iv + cipherText
 *   mac           = HMAC-SHA256(message, signatureKey)
 *   token         = base64url(message + mac)
 *
 * Docs: https://shopify.dev/docs/api/multipass
 *
 * Prerequisites:
 *   - Shop must be on Shopify Plus
 *   - Multipass must be enabled in Shopify Admin > Settings > Customer accounts
 *   - The multipass secret from that page must be stored (encrypted) in shopDoc.settings.multipassSecret
 */

import crypto from "node:crypto";

export interface MultipassCustomerData {
  /** Required by Shopify. Must be the customer's email address. */
  email: string;
  /**
   * ISO 8601 timestamp — must be within 90 seconds of now to prevent replay attacks.
   * Use new Date().toISOString().
   */
  created_at: string;
  first_name?: string;
  last_name?: string;
  /** Comma-separated Shopify customer tags. */
  tag_string?: string;
  /** Where to redirect after login. Defaults to /account. */
  return_to?: string;
  /** A unique identifier for the customer; used to prevent duplicate account creation. */
  identifier?: string;
}

/**
 * Generates a Shopify Multipass token for the given customer.
 *
 * @param customerData — customer object to encode in the token
 * @param multipassSecret — plaintext secret from Shopify Admin settings
 * @returns base64url-encoded multipass token
 */
export function generateMultipassToken(
  customerData: MultipassCustomerData,
  multipassSecret: string
): string {
  const hash = crypto.createHash("sha256").update(multipassSecret).digest();
  const encryptionKey = hash.subarray(0, 16);
  const signatureKey = hash.subarray(16, 32);

  const json = JSON.stringify(customerData);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv("aes-128-cbc", encryptionKey, iv);
  const cipherText = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);

  const message = Buffer.concat([iv, cipherText]);
  const mac = crypto.createHmac("sha256", signatureKey).update(message).digest();

  return Buffer.concat([message, mac]).toString("base64url");
}

/**
 * Builds the full Multipass login URL for a shop.
 */
export function buildMultipassUrl(shopDomain: string, token: string): string {
  return `https://${shopDomain}/account/login/multipass/${token}`;
}
