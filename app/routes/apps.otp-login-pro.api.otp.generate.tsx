/**
 * Shopify App Proxy route for OTP generation.
 *
 * Store URL:  /apps/otp-login-pro/api/otp/generate
 * Forwarded to this route by Shopify App Proxy.
 *
 * Delegates entirely to the canonical API route.
 */
export { action, loader } from "~/routes/api.otp.generate";
