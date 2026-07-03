/**
 * Shopify App Proxy route for post-OTP login redirect.
 *
 * Store URL:  /apps/otp-login-pro/api/auth/login
 * Forwarded to this route by Shopify App Proxy.
 *
 * Delegates entirely to the canonical API route.
 */
export { loader } from "~/routes/api.auth.login";
