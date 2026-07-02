import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Outlet,
  useLoaderData,
  useLocation,
  useNavigate,
  useRouteError,
} from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { Page, Tabs, Card } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";

const TABS = [
  { id: "general", content: "General", path: "/app/settings/general" },
  { id: "otp", content: "OTP", path: "/app/settings/otp" },
  { id: "security", content: "Security", path: "/app/settings/security" },
  { id: "countries", content: "Countries", path: "/app/settings/countries" },
  { id: "providers", content: "SMS Providers", path: "/app/settings/providers" },
] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function SettingsLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const selectedIndex = TABS.findIndex((t) =>
    location.pathname.startsWith(t.path)
  );
  const selected = selectedIndex === -1 ? 0 : selectedIndex;

  return (
    <Page
      title="Settings"
      subtitle="Configure OTP Login Pro for your store"
      backAction={{ url: "/app", content: "Dashboard" }}
    >
      <Card padding="0">
        <Tabs
          tabs={TABS.map((t) => ({ id: t.id, content: t.content }))}
          selected={selected}
          onSelect={(index) => navigate(TABS[index].path)}
          fitted
        >
          <Outlet />
        </Tabs>
      </Card>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
