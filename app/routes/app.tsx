import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
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
  await authenticate.admin(request);
  return json({ apiKey: process.env.SHOPIFY_API_KEY ?? "" });
};

export default function AppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <PolarisProvider i18n={enTranslations}>
        <PolarisVizProvider>
          <NavMenu>
            <Link to="/app" rel="home">
              Dashboard
            </Link>
            <Link to="/app/settings">Settings</Link>
            <Link to="/app/analytics">Analytics</Link>
            <Link to="/app/security">Security</Link>
            <Link to="/app/billing">Billing</Link>
          </NavMenu>
          <Outlet />
        </PolarisVizProvider>
      </PolarisProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
