import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import polarisVizStyles from "@shopify/polaris-viz/build/esm/styles.css?url";
import { PolarisVizProvider } from "@shopify/polaris-viz";
import { authenticate } from "~/shopify.server";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: polarisVizStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.admin(request);
  } catch (err) {
    if (err instanceof Response) throw err;
    console.error("[app.tsx] authenticate.admin threw non-Response error:", err);
    throw err;
  }
  return json({ apiKey: process.env.SHOPIFY_API_KEY ?? "" });
};

export default function AppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <PolarisVizProvider>
        <NavMenu>
          <a href="/app" rel="home">
            Dashboard
          </a>
          <a href="/app/settings">Settings</a>
          <a href="/app/analytics">Analytics</a>
          <a href="/app/security">Security</a>
          <a href="/app/customers">Customers</a>
          <a href="/app/logs">Logs</a>
          <a href="/app/billing">Billing</a>
        </NavMenu>
        <Outlet />
      </PolarisVizProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("[app.tsx ErrorBoundary]", error);
  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
