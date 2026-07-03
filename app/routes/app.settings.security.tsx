/**
 * Security Settings — /app/settings/security
 *
 * Sections:
 *  - Core Security: auto-detect country, CAPTCHA, VPN detection
 *  - Fraud Detection (Growth+): enable/disable, velocity limits, auto-block
 *  - Email Domain Blocklist (Growth+): add/remove blocked domains
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineStack,
  ResourceItem,
  ResourceList,
  Text,
  TextField,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useCallback, useEffect, useState } from "react";
import { requireAdminAuth } from "~/middleware/auth.middleware";
import { settingsService } from "~/services/settings.service";
import { getPlan } from "~/config/plans";
import type { PlanKey } from "~/config/plans";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop, shopData } = await requireAdminAuth(args);
  const planKey = (shopData?.billing?.planId ?? "free") as PlanKey;
  const plan = getPlan(planKey);
  const settings = shopData?.settings ?? null;

  return json({
    shop,
    settings,
    planKey,
    hasFraudDetection: plan.fraudDetectionEnabled,
  });
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async (args: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(args);
  const formData = await args.request.formData();
  const intent = formData.get("intent") as string;

  // ── Core / Fraud settings save ────────────────────────────────────────────
  if (intent === "save_security") {
    const ipVelocityLimit = parseInt(formData.get("ipVelocityLimit") as string, 10);
    const ipVelocityWindowMinutes = parseInt(
      formData.get("ipVelocityWindowMinutes") as string,
      10
    );
    const phoneVelocityLimit = parseInt(
      formData.get("phoneVelocityLimit") as string,
      10
    );
    const phoneVelocityWindowMinutes = parseInt(
      formData.get("phoneVelocityWindowMinutes") as string,
      10
    );
    const autoBlockThreshold = parseInt(
      formData.get("autoBlockThreshold") as string,
      10
    );

    const update = {
      autoDetectCountry: formData.get("autoDetectCountry") === "true",
      captchaEnabled: formData.get("captchaEnabled") === "true",
      vpnDetectionEnabled: formData.get("vpnDetectionEnabled") === "true",
      fraudDetectionEnabled: formData.get("fraudDetectionEnabled") === "true",
      autoBlockEnabled: formData.get("autoBlockEnabled") === "true",
      ...(!isNaN(ipVelocityLimit) && { ipVelocityLimit: Math.min(500, Math.max(1, ipVelocityLimit)) }),
      ...(!isNaN(ipVelocityWindowMinutes) && { ipVelocityWindowMinutes: Math.min(1440, Math.max(1, ipVelocityWindowMinutes)) }),
      ...(!isNaN(phoneVelocityLimit) && { phoneVelocityLimit: Math.min(100, Math.max(1, phoneVelocityLimit)) }),
      ...(!isNaN(phoneVelocityWindowMinutes) && { phoneVelocityWindowMinutes: Math.min(1440, Math.max(1, phoneVelocityWindowMinutes)) }),
      ...(!isNaN(autoBlockThreshold) && { autoBlockThreshold: Math.min(500, Math.max(5, autoBlockThreshold)) }),
    };

    const result = await settingsService.updateSettings(shop, update);
    if (!result.success) {
      return json({ ok: false, intent, error: result.error }, { status: 500 });
    }
    return json({ ok: true, intent, error: null });
  }

  // ── Email domain blocklist ────────────────────────────────────────────────
  if (intent === "add_domain") {
    const domain = (formData.get("domain") as string ?? "").toLowerCase().trim();
    if (!domain || !domain.includes(".") || domain.startsWith(".")) {
      return json({ ok: false, intent, error: "Invalid domain format" }, { status: 400 });
    }

    const shopDoc = await requireAdminAuth(args).then(({ shopData }) => shopData);
    const existing: string[] = shopDoc?.settings?.blockedEmailDomains ?? [];

    if (existing.includes(domain)) {
      return json({ ok: false, intent, error: "Domain is already blocked" }, { status: 409 });
    }

    const result = await settingsService.updateSettings(shop, {
      blockedEmailDomains: [...existing, domain],
    });
    if (!result.success) {
      return json({ ok: false, intent, error: result.error }, { status: 500 });
    }
    return json({ ok: true, intent, error: null, domain });
  }

  if (intent === "remove_domain") {
    const domain = (formData.get("domain") as string ?? "").toLowerCase().trim();
    const shopDoc = await requireAdminAuth(args).then(({ shopData }) => shopData);
    const existing: string[] = shopDoc?.settings?.blockedEmailDomains ?? [];

    const result = await settingsService.updateSettings(shop, {
      blockedEmailDomains: existing.filter((d) => d !== domain),
    });
    if (!result.success) {
      return json({ ok: false, intent, error: result.error }, { status: 500 });
    }
    return json({ ok: true, intent, error: null, domain });
  }

  return json({ ok: false, intent, error: "Unknown intent" }, { status: 400 });
};

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionData = {
  ok: boolean;
  intent: string;
  error: string | null;
  domain?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SecuritySettings() {
  const { settings, planKey, hasFraudDetection } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const domainFetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  const isSaving =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "save_security";

  const [newDomain, setNewDomain] = useState("");

  const isGrowthOrAbove = hasFraudDetection;

  // Controlled state for fraud detection fields
  const [fraudEnabled, setFraudEnabled] = useState(
    settings?.fraudDetectionEnabled ?? false
  );
  const [autoBlockEnabled, setAutoBlockEnabled] = useState(
    settings?.autoBlockEnabled ?? false
  );
  const [ipLimit, setIpLimit] = useState(
    String(settings?.ipVelocityLimit ?? 20)
  );
  const [ipWindow, setIpWindow] = useState(
    String(settings?.ipVelocityWindowMinutes ?? 60)
  );
  const [phoneLimit, setPhoneLimit] = useState(
    String(settings?.phoneVelocityLimit ?? 5)
  );
  const [phoneWindow, setPhoneWindow] = useState(
    String(settings?.phoneVelocityWindowMinutes ?? 60)
  );
  const [autoBlockThreshold, setAutoBlockThreshold] = useState(
    String(settings?.autoBlockThreshold ?? 50)
  );

  const blockedDomains: string[] = settings?.blockedEmailDomains ?? [];

  // Toast on save
  useEffect(() => {
    if (actionData?.intent === "save_security") {
      if (actionData.ok) {
        shopify.toast.show("Security settings saved.");
      } else {
        shopify.toast.show(actionData.error ?? "Save failed", { isError: true });
      }
    }
  }, [actionData, shopify]);

  // Toast on domain actions
  useEffect(() => {
    if (domainFetcher.state === "idle" && domainFetcher.data) {
      const d = domainFetcher.data;
      if (d.ok && d.intent === "add_domain") {
        setNewDomain("");
        shopify.toast.show(`Domain "${d.domain}" blocked.`);
      } else if (d.ok && d.intent === "remove_domain") {
        shopify.toast.show(`Domain "${d.domain}" unblocked.`);
      } else if (!d.ok) {
        shopify.toast.show(d.error ?? "Action failed", { isError: true });
      }
    }
  }, [domainFetcher.state, domainFetcher.data, shopify]);

  const handleAddDomain = useCallback(() => {
    if (!newDomain.trim()) return;
    const fd = new FormData();
    fd.set("intent", "add_domain");
    fd.set("domain", newDomain.trim());
    domainFetcher.submit(fd, { method: "post" });
  }, [newDomain, domainFetcher]);

  const handleRemoveDomain = useCallback(
    (domain: string) => {
      const fd = new FormData();
      fd.set("intent", "remove_domain");
      fd.set("domain", domain);
      domainFetcher.submit(fd, { method: "post" });
    },
    [domainFetcher]
  );

  return (
    <Box padding="400">
      <Form method="post">
        <input type="hidden" name="intent" value="save_security" />
        {/* Pass controlled fraud detection values as hidden inputs */}
        <input type="hidden" name="fraudDetectionEnabled" value={String(fraudEnabled)} />
        <input type="hidden" name="autoBlockEnabled" value={String(autoBlockEnabled)} />
        <input type="hidden" name="ipVelocityLimit" value={ipLimit} />
        <input type="hidden" name="ipVelocityWindowMinutes" value={ipWindow} />
        <input type="hidden" name="phoneVelocityLimit" value={phoneLimit} />
        <input type="hidden" name="phoneVelocityWindowMinutes" value={phoneWindow} />
        <input type="hidden" name="autoBlockThreshold" value={autoBlockThreshold} />

        <BlockStack gap="600">
          {/* ── Core Security ── */}
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Core Security
            </Text>
            <Divider />
            <Checkbox
              label="Auto-detect customer country"
              name="autoDetectCountry"
              value="true"
              defaultChecked={settings?.autoDetectCountry !== false}
              helpText="Pre-fills the country dial code based on the customer's IP address"
            />
          </BlockStack>

          {/* ── Fraud Protection ── */}
          <BlockStack gap="400">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Fraud Protection
              </Text>
              {!isGrowthOrAbove && (
                <Badge tone="warning">Growth plan required</Badge>
              )}
            </InlineStack>
            <Divider />

            {!isGrowthOrAbove && (
              <Banner
                title="Fraud detection requires Growth or Enterprise plan"
                tone="info"
                action={{ content: "View plans", url: "/app/billing" }}
              >
                <Text as="p" variant="bodySm">
                  Upgrade to unlock IP/phone velocity limits, auto-block,
                  CAPTCHA, VPN detection, and email domain blocking.
                </Text>
              </Banner>
            )}

            <BlockStack gap="400">
              <Checkbox
                label="Enable CAPTCHA verification"
                name="captchaEnabled"
                value="true"
                defaultChecked={isGrowthOrAbove && (settings?.captchaEnabled ?? false)}
                disabled={!isGrowthOrAbove}
                helpText="Require CAPTCHA before OTP is sent (reduces bot abuse)"
              />
              <Checkbox
                label="Block VPN / proxy IPs"
                name="vpnDetectionEnabled"
                value="true"
                defaultChecked={isGrowthOrAbove && (settings?.vpnDetectionEnabled ?? false)}
                disabled={!isGrowthOrAbove}
                helpText="Reject OTP requests from known VPN and proxy services"
              />
              <Checkbox
                label="Enable advanced fraud detection"
                checked={isGrowthOrAbove ? fraudEnabled : false}
                onChange={setFraudEnabled}
                disabled={!isGrowthOrAbove}
                helpText="Enables velocity limiting and auto-block rules below"
              />
            </BlockStack>

            {/* Velocity settings — only shown when fraud detection enabled */}
            {isGrowthOrAbove && fraudEnabled && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h3" variant="headingSm">
                    Velocity Limits
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Block OTP requests when a single IP or phone number
                    exceeds the threshold within the time window.
                  </Text>

                  <BlockStack gap="300">
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      IP Address Limits
                    </Text>
                    <InlineStack gap="300">
                      <div style={{ flex: 1 }}>
                        <TextField
                          label="Max requests per window"
                          type="number"
                          value={ipLimit}
                          onChange={setIpLimit}
                          min={1}
                          max={500}
                          autoComplete="off"
                          suffix="requests"
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <TextField
                          label="Window duration"
                          type="number"
                          value={ipWindow}
                          onChange={setIpWindow}
                          min={1}
                          max={1440}
                          autoComplete="off"
                          suffix="minutes"
                        />
                      </div>
                    </InlineStack>
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="300">
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      Phone / Email Limits
                    </Text>
                    <InlineStack gap="300">
                      <div style={{ flex: 1 }}>
                        <TextField
                          label="Max requests per window"
                          type="number"
                          value={phoneLimit}
                          onChange={setPhoneLimit}
                          min={1}
                          max={100}
                          autoComplete="off"
                          suffix="requests"
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <TextField
                          label="Window duration"
                          type="number"
                          value={phoneWindow}
                          onChange={setPhoneWindow}
                          min={1}
                          max={1440}
                          autoComplete="off"
                          suffix="minutes"
                        />
                      </div>
                    </InlineStack>
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="300">
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      Auto-Block
                    </Text>
                    <Checkbox
                      label="Automatically add IP to blocklist after repeated violations"
                      checked={autoBlockEnabled}
                      onChange={setAutoBlockEnabled}
                      helpText="A 7-day temporary block is applied once the daily threshold is reached"
                    />
                    {autoBlockEnabled && (
                      <div style={{ maxWidth: "240px" }}>
                        <TextField
                          label="Daily violations before auto-block"
                          type="number"
                          value={autoBlockThreshold}
                          onChange={setAutoBlockThreshold}
                          min={5}
                          max={500}
                          autoComplete="off"
                          suffix="violations"
                        />
                      </div>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>
            )}
          </BlockStack>

          <InlineStack align="end">
            <Button submit variant="primary" loading={isSaving}>
              Save Security Settings
            </Button>
          </InlineStack>
        </BlockStack>
      </Form>

      {/* ── Email Domain Blocklist ── */}
      <Box paddingBlockStart="600">
        <BlockStack gap="400">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h2" variant="headingMd">
              Email Domain Blocklist
            </Text>
            {!isGrowthOrAbove && (
              <Badge tone="warning">Growth plan required</Badge>
            )}
          </InlineStack>
          <Divider />

          {!isGrowthOrAbove ? (
            <Text as="p" variant="bodySm" tone="subdued">
              Upgrade to Growth to block disposable email domains (e.g.
              mailinator.com, guerrillamail.com).
            </Text>
          ) : (
            <BlockStack gap="300">
              <Text as="p" variant="bodySm" tone="subdued">
                OTP emails to addresses from these domains will be blocked.
                Useful for blocking disposable / throwaway email providers.
              </Text>

              <InlineStack gap="200" blockAlign="end">
                <div style={{ flex: 1, maxWidth: "320px" }}>
                  <TextField
                    label="Add domain"
                    value={newDomain}
                    onChange={setNewDomain}
                    autoComplete="off"
                    placeholder="mailinator.com"
                    helpText="Enter the domain without @ or protocol"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddDomain();
                      }
                    }}
                  />
                </div>
                <div style={{ paddingBottom: "20px" }}>
                  <Button
                    onClick={handleAddDomain}
                    loading={
                      domainFetcher.state === "submitting" &&
                      domainFetcher.formData?.get("intent") === "add_domain"
                    }
                    disabled={!newDomain.trim()}
                  >
                    Block domain
                  </Button>
                </div>
              </InlineStack>

              {blockedDomains.length > 0 ? (
                <Card padding="0">
                  <ResourceList
                    resourceName={{ singular: "domain", plural: "domains" }}
                    items={blockedDomains}
                    renderItem={(domain) => (
                      <ResourceItem
                        id={domain}
                        accessibilityLabel={`Blocked domain: ${domain}`}
                        shortcutActions={[
                          {
                            content: "Unblock",
                            onAction: () => handleRemoveDomain(domain),
                          },
                        ]}
                      >
                        <Text as="p" variant="bodyMd">
                          {domain}
                        </Text>
                      </ResourceItem>
                    )}
                  />
                </Card>
              ) : (
                <Text as="p" variant="bodySm" tone="subdued">
                  No domains blocked yet.
                </Text>
              )}
            </BlockStack>
          )}
        </BlockStack>
      </Box>
    </Box>
  );
}
