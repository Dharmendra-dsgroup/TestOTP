/**
 * Shopify App Proxy route for OTP verification.
 *
 * Store URL:  /apps/otp-login-pro/api/otp/verify
 * Forwarded to this route by Shopify App Proxy.
 *
 * Delegates entirely to the canonical API route.
 */
export { action, loader } from "~/routes/api.otp.verify";
