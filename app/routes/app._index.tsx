import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Banner,
  Box,
  Divider,
} from "@shopify/polaris";
import { requireAdminAuth } from "~/middleware/auth.middleware";

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop, shopData } = await requireAdminAuth(args);

  return json({
    shop,
    plan: shopData?.plan ?? "free",
    isActive: shopData?.isActive ?? false,
    otpUsed: shopData?.billing?.otpUsedThisPeriod ?? 0,
    otpLimit: shopData?.billing?.otpLimitPerPeriod ?? 100,
    settings: {
      smsEnabled: shopData?.settings?.enableSmsOtp ?? false,
      emailEnabled: shopData?.settings?.enableEmailOtp ?? false,
    },
  });
};

export default function DashboardIndex() {
  const { shop, plan, isActive, otpUsed, otpLimit, settings } =
    useLoaderData<typeof loader>();

  const usagePercent =
    otpLimit > 0 ? Math.min(100, Math.round((otpUsed / otpLimit) * 100)) : 0;

  return (
    <Page title="OTP Login Pro" subtitle="Passwordless login for your store">
      <BlockStack gap="500">
        {!isActive && (
          <Banner title="Setup required" tone="warning">
            <Text as="p" variant="bodyMd">
              Configure your SMS provider in Settings to start sending OTPs.
            </Text>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Store Overview
                </Text>
                <Divider />
                <InlineStack gap="400" align="space-between">
                  <BlockStack gap="100">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Shop Domain
                    </Text>
                    <Text as="span" variant="bodyMd">
                      {shop}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Plan
                    </Text>
                    <Badge
                      tone={plan === "enterprise" ? "success" : "info"}
                    >
                      {plan.charAt(0).toUpperCase() + plan.slice(1)}
                    </Badge>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Status
                    </Text>
                    <Badge tone={isActive ? "success" : "warning"}>
                      {isActive ? "Active" : "Setup Required"}
                    </Badge>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    OTP Usage
                  </Text>
                  <Divider />
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd" tone="subdued">
                        Used this period
                      </Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {otpUsed.toLocaleString()}
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd" tone="subdued">
                        Limit
                      </Text>
                      <Text as="span" variant="bodyMd">
                        {otpLimit === -1
                          ? "Unlimited"
                          : otpLimit.toLocaleString()}
                      </Text>
                    </InlineStack>
                    {otpLimit !== -1 && (
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodyMd" tone="subdued">
                          Usage
                        </Text>
                        <Badge
                          tone={
                            usagePercent >= 90
                              ? "critical"
                              : usagePercent >= 70
                              ? "warning"
                              : "success"
                          }
                        >
                          {usagePercent}%
                        </Badge>
                      </InlineStack>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Channels
                  </Text>
                  <Divider />
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        SMS OTP
                      </Text>
                      <Badge
                        tone={settings.smsEnabled ? "success" : "attention"}
                      >
                        {settings.smsEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        Email OTP
                      </Text>
                      <Badge
                        tone={
                          settings.emailEnabled ? "success" : "attention"
                        }
                      >
                        {settings.emailEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        <Box paddingBlock="400">
          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
            OTP Login Pro v1.0.0 — Phase 1
          </Text>
        </Box>
      </BlockStack>
    </Page>
  );
}
