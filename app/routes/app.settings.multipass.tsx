/**
 * Shopify Plus / Multipass Settings — /app/settings/multipass
 *
 * Allows merchants on Shopify Plus to configure Multipass for seamless
 * OTP-verified customer login (no password required, even for ENABLED accounts).
 *
 * Prerequisites for merchants:
 *   1. Shopify Plus plan
 *   2. Multipass enabled in: Shopify Admin → Settings → Customer accounts → Enable Multipass
 *   3. Copy the Multipass secret from that page and paste it here
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Checkbox,
  Divider,
  InlineStack,
  Link,
  Text,
  TextField,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useEffect } from "react";
import { requireAdminAuth } from "~/middleware/auth.middleware";
import { settingsService } from "~/services/settings.service";
import { shopRepository } from "~/repositories/shop.repository";
import { auditLogService } from "~/services/audit-log.service";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionResult =
  | { intent: "save"; success: true }
  | { intent: "save"; success: false; error: string }
  | { intent: "test"; testUrl: string }
  | { intent: "test"; error: string }
  | { intent: "clear"; success: true }
  | { intent: "clear"; success: false; error: string };

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop, shopData } = await requireAdminAuth(args);

  // Load the shop document with the hidden multipassSecret field selected
  const shopWithSecret = await shopRepository.findByDomainWithMultipassSecret(shop);

  return json({
    shop,
    shopifyPlusEnabled: shopData?.settings?.shopifyPlusEnabled ?? false,
    hasMultipassSecret: !!(shopWithSecret?.settings?.multipassSecret),
  });
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async (args: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(args);
  const formData = await args.request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save") {
    const shopifyPlusEnabled = formData.get("shopifyPlusEnabled") === "true";
    const multipassSecret = (formData.get("multipassSecret") as string | null) ?? "";

    const result = await settingsService.updateMultipassSettings(shop, {
      shopifyPlusEnabled,
      multipassSecret: multipassSecret || undefined,
    });

    if (!result.success) {
      return json<ActionResult>({ intent: "save", success: false, error: result.error ?? "Save failed" });
    }

    await auditLogService.logAction(shop, "settings.updated", "success", {
      targetType: "multipassSettings",
      metadata: {
        shopifyPlusEnabled,
        secretUpdated: !!multipassSecret,
      },
    });

    return json<ActionResult>({ intent: "save", success: true });
  }

  if (intent === "test") {
    const result = await settingsService.getMultipassTestUrl(shop);
    if (!result.success) {
      return json<ActionResult>({ intent: "test", error: result.error ?? "Test failed" });
    }
    return json<ActionResult>({ intent: "test", testUrl: result.data });
  }

  if (intent === "clear") {
    const result = await settingsService.clearMultipassSecret(shop);
    if (!result.success) {
      return json<ActionResult>({ intent: "clear", success: false, error: result.error ?? "Clear failed" });
    }

    await auditLogService.logAction(shop, "settings.updated", "success", {
      targetType: "multipassSettings",
      metadata: { cleared: true },
    });

    return json<ActionResult>({ intent: "clear", success: true });
  }

  return json({ intent: "unknown", error: "Unknown action" }, { status: 400 });
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function MultipassSettings() {
  const { shopifyPlusEnabled, hasMultipassSecret } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  const isSaving = navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "save";
  const isTesting = navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "test";
  const isClearing = navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "clear";

  const [plusEnabled, setPlusEnabled] = useState(shopifyPlusEnabled);
  const [secret, setSecret] = useState("");

  // Toast notifications
  useEffect(() => {
    if (!actionData) return;
    if (actionData.intent === "save" && actionData.success) {
      shopify.toast.show("Multipass settings saved");
      setSecret(""); // clear the secret field after save
    }
    if (actionData.intent === "clear" && actionData.success) {
      shopify.toast.show("Multipass secret cleared");
      setPlusEnabled(false);
    }
  }, [actionData, shopify]);

  const testUrl =
    actionData?.intent === "test" && "testUrl" in actionData
      ? actionData.testUrl
      : null;
  const testError =
    actionData?.intent === "test" && "error" in actionData
      ? actionData.error
      : null;
  const saveError =
    actionData?.intent === "save" && !actionData.success
      ? actionData.error
      : null;
  const clearError =
    actionData?.intent === "clear" && !actionData.success
      ? actionData.error
      : null;

  return (
    <Box padding="600">
      <BlockStack gap="600">

        {/* Requirements banner */}
        <Banner title="Shopify Plus required" tone="info">
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              Multipass lets OTP-verified customers log in instantly without a
              password — even if they already have an account. It requires a{" "}
              <strong>Shopify Plus</strong> plan.
            </Text>
            <Text as="p" variant="bodyMd">
              To get your Multipass secret: Shopify Admin → Settings →
              Customer accounts → scroll to <strong>Multipass</strong> →
              enable it → copy the secret.
            </Text>
          </BlockStack>
        </Banner>

        {(saveError || clearError) && (
          <Banner title="Error" tone="critical">
            <Text as="p">{saveError ?? clearError}</Text>
          </Banner>
        )}

        {/* Enable toggle */}
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Multipass Login
          </Text>
          <Divider />
          <Form method="post">
            <input type="hidden" name="intent" value="save" />
            {/* Controlled checkbox must send its value explicitly */}
            <input type="hidden" name="shopifyPlusEnabled" value={String(plusEnabled)} />
            <BlockStack gap="400">
              <Checkbox
                label="Enable Shopify Plus / Multipass login"
                checked={plusEnabled}
                onChange={setPlusEnabled}
                helpText="When enabled, OTP-verified customers are logged in directly using Multipass. Requires a valid secret below."
              />

              {/* Multipass secret */}
              <BlockStack gap="200">
                <InlineStack gap="200" align="start" blockAlign="center">
                  <Text as="p" variant="bodyMd" fontWeight="medium">
                    Multipass Secret
                  </Text>
                  {hasMultipassSecret ? (
                    <Badge tone="success">Configured</Badge>
                  ) : (
                    <Badge tone="attention">Not set</Badge>
                  )}
                </InlineStack>
                <TextField
                  label="Multipass secret"
                  labelHidden
                  name="multipassSecret"
                  type="password"
                  value={secret}
                  onChange={setSecret}
                  autoComplete="off"
                  placeholder={
                    hasMultipassSecret
                      ? "Enter new secret to update (leave blank to keep current)"
                      : "Paste your Multipass secret here"
                  }
                  helpText={
                    hasMultipassSecret
                      ? "A secret is already stored. Enter a new value only if you need to rotate it."
                      : "Copy from: Shopify Admin → Settings → Customer accounts → Multipass."
                  }
                />
              </BlockStack>

              <InlineStack align="end" gap="300">
                <Button submit variant="primary" loading={isSaving}>
                  Save Settings
                </Button>
              </InlineStack>
            </BlockStack>
          </Form>
        </BlockStack>

        {/* Test + Clear */}
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Test & Manage
          </Text>
          <Divider />
          <Text as="p" tone="subdued">
            Generate a short-lived test URL to verify your Multipass secret is
            valid. The token expires in 90 seconds — open it quickly in a new tab.
          </Text>

          <InlineStack gap="300">
            <Form method="post">
              <input type="hidden" name="intent" value="test" />
              <Button
                submit
                loading={isTesting}
                disabled={!hasMultipassSecret}
                tone="success"
              >
                Generate Test URL
              </Button>
            </Form>

            <Form method="post">
              <input type="hidden" name="intent" value="clear" />
              <Button
                submit
                loading={isClearing}
                disabled={!hasMultipassSecret}
                tone="critical"
                variant="plain"
              >
                Clear Secret
              </Button>
            </Form>
          </InlineStack>

          {testError && (
            <Banner title="Test failed" tone="critical">
              <Text as="p">{testError}</Text>
            </Banner>
          )}

          {testUrl && (
            <Banner title="Test URL generated — valid for ~90 seconds" tone="success">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" breakWord>
                  {testUrl}
                </Text>
                <Link url={testUrl} target="_blank">
                  Open in new tab →
                </Link>
              </BlockStack>
            </Banner>
          )}
        </BlockStack>

      </BlockStack>
    </Box>
  );
}
