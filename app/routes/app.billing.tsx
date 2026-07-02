/**
 * Billing page — /app/billing
 *
 * Shows the current plan, usage, and all available upgrade/downgrade options.
 * Initiating a subscription POSTs to this route's action, which calls
 * BillingService.initiateSubscription() and redirects to Shopify's
 * confirmation URL.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  useLoaderData,
  useNavigation,
  useSubmit,
  Form,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  ProgressBar,
  Divider,
  Banner,
  List,
  Box,
  Icon,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { requireAdminAuth } from "~/middleware/auth.middleware";
import { billingService } from "~/services/billing.service";
import { PLAN_LIST, getPlan, usagePercent } from "~/config/plans";
import type { PlanKey } from "~/config/plans";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop, shopData } = await requireAdminAuth(args);

  const currentPlanKey = (shopData?.billing?.planId ?? "free") as PlanKey;
  const currentPlan = getPlan(currentPlanKey);
  const billingStatus = shopData?.billing?.status ?? "active";
  const trialEndsAt = shopData?.billing?.trialEndsAt ?? null;
  const currentPeriodEnd = shopData?.billing?.currentPeriodEnd ?? null;

  const limitCheck = await billingService.checkPlanLimit(shop);
  const { currentCount, limit, nearLimit } = limitCheck.success
    ? limitCheck.data
    : { currentCount: 0, limit: currentPlan.monthlyOtpLimit, nearLimit: false };

  const pct = usagePercent(currentPlan, currentCount);

  return json({
    shop,
    currentPlanKey,
    currentPlanName: currentPlan.name,
    billingStatus,
    trialEndsAt: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
    currentPeriodEnd: currentPeriodEnd
      ? new Date(currentPeriodEnd).toISOString()
      : null,
    currentCount,
    limit,
    nearLimit,
    usagePct: pct,
    plans: PLAN_LIST.map((p) => ({
      key: p.key,
      name: p.name,
      price: p.price,
      trialDays: p.trialDays,
      monthlyOtpLimit: p.monthlyOtpLimit,
      highlights: p.highlights,
      isCurrent: p.key === currentPlanKey,
    })),
  });
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async (args: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(args);
  const formData = await args.request.formData();
  const intent = formData.get("intent") as string;
  const planKey = formData.get("planKey") as PlanKey;

  if (intent === "upgrade" && planKey) {
    const result = await billingService.initiateSubscription(shop, planKey);

    if (!result.success) {
      return json({ error: result.error }, { status: 422 });
    }

    // Redirect the merchant to Shopify's billing confirmation page
    return redirect(result.data.confirmationUrl);
  }

  if (intent === "cancel") {
    const result = await billingService.cancelSubscription(shop);
    if (!result.success) {
      return json({ error: result.error }, { status: 422 });
    }
    return redirect("/app/billing");
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const {
    currentPlanKey,
    currentPlanName,
    billingStatus,
    trialEndsAt,
    currentPeriodEnd,
    currentCount,
    limit,
    nearLimit,
    usagePct,
    plans,
  } = useLoaderData<typeof loader>();

  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";

  const isTrial = billingStatus === "trial";
  const isFrozen = billingStatus === "frozen";
  const isFree = currentPlanKey === "free";

  const limitLabel =
    limit === -1 ? "Unlimited" : limit.toLocaleString();
  const usedLabel = currentCount.toLocaleString();

  function handleUpgrade(planKey: PlanKey) {
    const fd = new FormData();
    fd.set("intent", "upgrade");
    fd.set("planKey", planKey);
    submit(fd, { method: "post" });
  }

  function handleCancel() {
    if (
      window.confirm(
        "Cancel your subscription? Your plan will revert to Free immediately."
      )
    ) {
      const fd = new FormData();
      fd.set("intent", "cancel");
      submit(fd, { method: "post" });
    }
  }

  return (
    <Page
      title="Billing & Plans"
      subtitle="Manage your OTP Login Pro subscription"
    >
      <BlockStack gap="500">
        {/* ── Status banners ── */}
        {isFrozen && (
          <Banner title="Subscription frozen" tone="critical">
            <Text as="p" variant="bodyMd">
              Your subscription is frozen due to a failed payment. Please update
              your billing information in your Shopify admin.
            </Text>
          </Banner>
        )}
        {isTrial && trialEndsAt && (
          <Banner title="Free trial active" tone="info">
            <Text as="p" variant="bodyMd">
              Your trial ends on{" "}
              {new Date(trialEndsAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              . You will not be charged until the trial expires.
            </Text>
          </Banner>
        )}
        {nearLimit && (
          <Banner title="Approaching OTP limit" tone="warning">
            <Text as="p" variant="bodyMd">
              You have used {usedLabel} of {limitLabel} OTPs this month. Upgrade
              your plan to avoid interruptions.
            </Text>
          </Banner>
        )}

        {/* ── Current plan & usage ── */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Current Plan
                  </Text>
                  <Badge
                    tone={
                      isFrozen
                        ? "critical"
                        : isTrial
                        ? "info"
                        : isFree
                        ? "new"
                        : "success"
                    }
                  >
                    {isTrial
                      ? "Trial"
                      : billingStatus.charAt(0).toUpperCase() +
                        billingStatus.slice(1)}
                  </Badge>
                </InlineStack>

                <Text as="p" variant="headingLg">
                  {currentPlanName}
                </Text>

                <Divider />

                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd" tone="subdued">
                      OTPs used this month
                    </Text>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {usedLabel} / {limitLabel}
                    </Text>
                  </InlineStack>
                  {limit !== -1 && (
                    <ProgressBar
                      progress={Math.min(usagePct, 100)}
                      tone={usagePct >= 100 ? "critical" : nearLimit ? "highlight" : "primary"}
                      size="small"
                    />
                  )}
                </BlockStack>

                {currentPeriodEnd && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Current billing period ends{" "}
                    {new Date(currentPeriodEnd).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                )}

                {!isFree && (
                  <Box paddingBlockStart="200">
                    <Button
                      tone="critical"
                      variant="plain"
                      disabled={isSubmitting}
                      onClick={handleCancel}
                    >
                      Cancel subscription
                    </Button>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* ── Plan cards ── */}
        <Text as="h2" variant="headingMd">
          Available Plans
        </Text>

        <Layout>
          {plans.map((plan) => (
            <Layout.Section key={plan.key} variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="start">
                    <Text as="h3" variant="headingSm">
                      {plan.name}
                    </Text>
                    {plan.isCurrent && (
                      <Badge tone="success">Current</Badge>
                    )}
                  </InlineStack>

                  <Text as="p" variant="headingLg">
                    {plan.price === 0
                      ? "Free"
                      : `$${plan.price.toFixed(2)}/mo`}
                  </Text>

                  {plan.trialDays > 0 && !plan.isCurrent && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      {plan.trialDays}-day free trial
                    </Text>
                  )}

                  <Divider />

                  <List type="bullet" gap="tight">
                    {plan.highlights.map((h, i) => (
                      <List.Item key={i}>{h}</List.Item>
                    ))}
                  </List>

                  <Box paddingBlockStart="200">
                    {plan.isCurrent ? (
                      <Button disabled fullWidth>
                        Current plan
                      </Button>
                    ) : plan.price === 0 ? (
                      <Button
                        fullWidth
                        disabled={isSubmitting || isFree}
                        onClick={handleCancel}
                        tone="critical"
                        variant="secondary"
                      >
                        Downgrade to Free
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        fullWidth
                        disabled={isSubmitting}
                        onClick={() => handleUpgrade(plan.key)}
                        loading={isSubmitting}
                      >
                        {currentPlanKey === "free" ||
                        getPlan(currentPlanKey).price < plan.price
                          ? "Upgrade"
                          : "Downgrade"}{" "}
                        to {plan.name}
                      </Button>
                    )}
                  </Box>
                </BlockStack>
              </Card>
            </Layout.Section>
          ))}
        </Layout>
      </BlockStack>
    </Page>
  );
}
