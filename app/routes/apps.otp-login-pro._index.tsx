/**
 * App Proxy health/ping endpoint.
 * GET https://yourstore.myshopify.com/apps/otp-login-pro
 * Returns JSON so you can confirm the proxy is wired up correctly.
 */
import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async (_args: LoaderFunctionArgs) => {
  return json({ ok: true, service: "otp-login-pro" });
};
