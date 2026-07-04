/**
 * Post-OTP login redirect handler.
 *
 * GET /api/auth/login?token={sessionToken}&shop={shop}
 *
 * This is the server-side leg of the "OTP verified → logged into Shopify" flow.
 *
 * Flow:
 *   1. Widget verifies OTP → gets sessionToken from /api/otp/verify
 *   2. Widget does: window.location.href = "/apps/otp-login-pro/api/auth/login?token=..."
 *   3. Shopify App Proxy forwards the GET request here
 *   4. We consume the one-time session token from Redis (60s TTL)
 *   5. Admin GraphQL: find-or-create Shopify customer by phone/email
 *   6. Generate account activation URL (or Multipass for Plus)
 *   7. Redirect customer to that URL → they land on Shopify account page, logged in
 *
 * Security notes:
 * - Session token is one-time-use (GETDEL)
 * - Session token is tied to shop domain (cross-shop replay is rejected)
 * - Proxy signature is validated before anything else
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  validateProxySignature,
  extractShopFromProxy,
  isProxySignatureRequired,
} from "~/lib/shopify/proxy-auth.server";
import { consumeLoginSession } from "~/lib/auth/login-session.server";
import { customerService } from "~/services/customer.service";
import { shopRepository } from "~/repositories/shop.repository";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Validate App Proxy signature
  if (isProxySignatureRequired() && !validateProxySignature(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  // Prefer `shop` from the proxy query param (injected by Shopify), fall back to explicit
  const shopDomain =
    extractShopFromProxy(request) ??
    url.searchParams.get("shop");

  if (!token || !shopDomain) {
    return redirect("/account?login_error=invalid_token");
  }

  // 1. Consume one-time login session
  const session = await consumeLoginSession(token, shopDomain);
  if (!session) {
    return redirect("/account?login_error=session_expired");
  }

  // 2. Get the shop's redirect preference
  const shopDoc = await shopRepository.findByDomain(shopDomain);
  const returnTo = shopDoc?.settings?.loginRedirectUrl ?? "/account";

  // 3. Find/create Shopify customer and generate login URL
  const result = await customerService.findOrCreateAndLogin(
    shopDomain,
    {
      phone: session.phone,
      email: session.email,
      channel: session.channel,
    },
    returnTo
  );

  if (!result.success) {
    console.error("[LoginHandler] Customer login failed:", result.error);
    return redirect(`/account?login_error=login_failed`);
  }

  const { loginUrl, loginMethod, email, autoFormPassword, autoFormReturnTo } = result.data;

  // 4a. Already-enabled customer — serve an auto-submit login form
  //     (The page runs at the store domain via App Proxy, so it can POST to /account/login)
  if (loginMethod === "auto_form" && email && autoFormPassword) {
    const safeEmail = email.replace(/"/g, "&quot;");
    const safePassword = autoFormPassword.replace(/"/g, "&quot;");
    const safeReturn = (autoFormReturnTo ?? "/account").replace(/"/g, "&quot;");

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Signing you in…</title></head>
<body>
<p style="font-family:sans-serif;text-align:center;margin-top:20vh">Signing you in…</p>
<script>
(async function () {
  try {
    var res = await fetch('/account/login', { credentials: 'same-origin' });
    var text = await res.text();
    var parser = new DOMParser();
    var doc = parser.parseFromString(text, 'text/html');
    var csrf = (doc.querySelector('input[name="authenticity_token"]') || {}).value || '';
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = '/account/login';
    [['form_type','customer_login'],['utf8','✓'],['authenticity_token',csrf],
     ['customer[email]',"${safeEmail}"],['customer[password]',"${safePassword}"],
     ['return_url',"${safeReturn}"]
    ].forEach(function(p){
      var i = document.createElement('input');
      i.type = 'hidden'; i.name = p[0]; i.value = p[1];
      form.appendChild(i);
    });
    document.body.appendChild(form);
    form.submit();
  } catch(e) {
    window.location.href = '/account/login';
  }
})();
</script>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 4b. Redirect to Shopify's activation/multipass URL
  return redirect(loginUrl, { status: 302 });
};
