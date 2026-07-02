/**
 * Analytics Dashboard — /app/analytics
 *
 * Displays:
 *  - KPI overview cards (totals + period-over-period delta)
 *  - OTP activity line chart (requested / sent / verified over time)
 *  - Conversion funnel (Requested → Sent → Verified → Login)
 *  - Channel breakdown donut chart (SMS / Email / WhatsApp)
 *  - Top 10 countries bar chart
 *
 * Time range selector: 7d / 30d / 90d (URL param `?range=7d`)
 * Plan gate: analytics require Growth or Enterprise plan.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
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
  Button,
  Divider,
  SkeletonBodyText,
  Tooltip,
} from "@shopify/polaris";
import {
  LineChart,
  DonutChart,
  BarChart,
  type DataSeries,
  type DataPoint,
} from "@shopify/polaris-viz";
import { requireAdminAuth } from "~/middleware/auth.middleware";
import {
  analyticsQueryService,
  type RangeKey,
  type TimeSeriesPoint,
  type OverviewMetrics,
  type ChannelBreakdown,
  type CountryDataPoint,
  type ConversionFunnelStep,
} from "~/services/analytics-query.service";
import { getPlan } from "~/config/plans";
import type { PlanKey } from "~/config/plans";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop, shopData } = await requireAdminAuth(args);
  const url = new URL(args.request.url);
  const rawRange = url.searchParams.get("range") ?? "7d";
  const range: RangeKey = ["7d", "30d", "90d"].includes(rawRange)
    ? (rawRange as RangeKey)
    : "7d";

  const planKey = (shopData?.billing?.planId ?? "free") as PlanKey;
  const plan = getPlan(planKey);
  const hasAnalytics = plan.analyticsEnabled;

  if (!hasAnalytics) {
    return json({
      range,
      hasAnalytics: false,
      planKey,
      overview: null,
      timeSeries: [],
      channelBreakdown: null,
      countryBreakdown: [],
      funnel: [],
      comparison: null,
    });
  }

  // Run all queries in parallel
  const [overview, timeSeries, channelBreakdown, countryBreakdown, funnel, comparison] =
    await Promise.all([
      analyticsQueryService.getOverviewMetrics(shop, range),
      analyticsQueryService.getTimeSeries(shop, range),
      analyticsQueryService.getChannelBreakdown(shop, range),
      analyticsQueryService.getCountryBreakdown(shop, range),
      analyticsQueryService.getConversionFunnel(shop, range),
      analyticsQueryService.getPeriodComparison(shop, range),
    ]);

  return json({
    range,
    hasAnalytics: true,
    planKey,
    overview: overview.success ? overview.data : null,
    timeSeries: timeSeries.success ? timeSeries.data : [],
    channelBreakdown: channelBreakdown.success ? channelBreakdown.data : null,
    countryBreakdown: countryBreakdown.success ? countryBreakdown.data : [],
    funnel: funnel.success ? funnel.data : [],
    comparison: comparison.success ? comparison.data : null,
  });
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

function deltaColor(pct: number): "success" | "critical" | "new" {
  if (pct > 0) return "success";
  if (pct < 0) return "critical";
  return "new";
}

function deltaLabel(pct: number): string {
  if (pct > 0) return `↑ ${pct}%`;
  if (pct < 0) return `↓ ${Math.abs(pct)}%`;
  return "No change";
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/** Build Polaris Viz DataSeries[] from our time series points. */
function buildTimeSeriesData(points: TimeSeriesPoint[]): DataSeries[] {
  const toPoints = (key: keyof TimeSeriesPoint): DataPoint[] =>
    points.map((p) => ({
      key: p.date.slice(5), // "MM-DD"
      value: p[key] as number,
    }));

  return [
    { name: "Requested", data: toPoints("otpRequested"), color: "purple" },
    { name: "Sent", data: toPoints("otpSent"), color: "blue" },
    { name: "Verified", data: toPoints("otpVerified"), color: "green" },
  ];
}

/** Build DonutChart data from channel breakdown. */
function buildChannelData(breakdown: ChannelBreakdown): DataSeries[] {
  const entries: Array<[string, number]> = [
    ["SMS", breakdown.sms],
    ["Email", breakdown.email],
    ["WhatsApp", breakdown.whatsapp],
    ["Voice", breakdown.voice],
  ].filter(([, v]) => v > 0) as Array<[string, number]>;

  if (entries.length === 0) {
    return [{ name: "No data", data: [{ key: "No data", value: 0 }] }];
  }

  return entries.map(([name, value]) => ({
    name,
    data: [{ key: name, value }],
  }));
}

/** Build BarChart data from country breakdown. */
function buildCountryData(countries: CountryDataPoint[]): DataSeries[] {
  if (countries.length === 0) {
    return [{ name: "No data", data: [{ key: "–", value: 0 }] }];
  }
  return [
    {
      name: "OTPs",
      data: countries.map((c) => ({ key: c.country, value: c.count })),
      color: "blue",
    },
  ];
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  delta?: number;
  tooltip?: string;
}

function KpiCard({ label, value, delta, tooltip }: KpiCardProps) {
  const content = (
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="headingLg" fontWeight="bold">
          {value}
        </Text>
        {delta !== undefined && (
          <Badge tone={deltaColor(delta)}>{deltaLabel(delta)}</Badge>
        )}
      </BlockStack>
    </Card>
  );

  return tooltip ? (
    <Tooltip content={tooltip}>{content}</Tooltip>
  ) : (
    content
  );
}

// ─── Funnel Bar ───────────────────────────────────────────────────────────────

function FunnelBar({ step, max }: { step: ConversionFunnelStep; max: number }) {
  const pct = max > 0 ? Math.round((step.value / max) * 100) : 0;
  return (
    <BlockStack gap="100">
      <InlineStack align="space-between">
        <Text as="span" variant="bodySm">
          {step.label}
        </Text>
        <Text as="span" variant="bodySm" fontWeight="semibold">
          {fmtNum(step.value)} ({pct}%)
        </Text>
      </InlineStack>
      <div
        style={{
          height: "8px",
          borderRadius: "4px",
          background: "#E4E5E7",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "#2C6ECB",
            borderRadius: "4px",
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </BlockStack>
  );
}

// ─── Upgrade Gate ─────────────────────────────────────────────────────────────

function UpgradeGate({ planKey }: { planKey: PlanKey }) {
  return (
    <Page title="Analytics" subtitle="Understand your OTP login performance">
      <Banner title="Analytics require Growth or Enterprise plan" tone="info">
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd">
            Upgrade to unlock detailed analytics including time-series charts,
            channel breakdowns, country data, and conversion funnels.
          </Text>
          <Box paddingBlockStart="200">
            <Button url="/app/billing" variant="primary">
              View plans
            </Button>
          </Box>
        </BlockStack>
      </Banner>
    </Page>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ range }: { range: string }) {
  return (
    <Card>
      <BlockStack gap="300" inlineAlign="center">
        <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
          No OTP activity in the {RANGE_LABELS[range as RangeKey] ?? range}. Data
          will appear here once customers start using the login widget.
        </Text>
      </BlockStack>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const {
    range,
    hasAnalytics,
    planKey,
    overview,
    timeSeries,
    channelBreakdown,
    countryBreakdown,
    funnel,
    comparison,
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();

  if (!hasAnalytics) {
    return <UpgradeGate planKey={planKey as PlanKey} />;
  }

  const hasData = (overview?.totalRequested ?? 0) > 0;
  const funnelMax = funnel[0]?.value ?? 0;

  const timeSeriesData = buildTimeSeriesData(
    timeSeries as TimeSeriesPoint[]
  );
  const channelData = channelBreakdown
    ? buildChannelData(channelBreakdown as ChannelBreakdown)
    : [];
  const countryData = buildCountryData(
    countryBreakdown as CountryDataPoint[]
  );

  return (
    <Page
      title="Analytics"
      subtitle={`${RANGE_LABELS[range as RangeKey]} — OTP login performance`}
      secondaryActions={[
        {
          content: "Last 7 days",
          onAction: () => navigate("/app/analytics?range=7d"),
          disabled: range === "7d",
        },
        {
          content: "Last 30 days",
          onAction: () => navigate("/app/analytics?range=30d"),
          disabled: range === "30d",
        },
        {
          content: "Last 90 days",
          onAction: () => navigate("/app/analytics?range=90d"),
          disabled: range === "90d",
        },
      ]}
    >
      <BlockStack gap="500">
        {/* ── KPI Cards ── */}
        <Layout>
          <Layout.Section variant="oneThird">
            <KpiCard
              label="OTPs Requested"
              value={fmtNum(overview?.totalRequested ?? 0)}
              delta={comparison?.requestedDelta}
              tooltip="Total OTP send requests in this period"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <KpiCard
              label="Verified"
              value={fmtNum(overview?.totalVerified ?? 0)}
              delta={comparison?.verifiedDelta}
              tooltip="OTPs verified successfully"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <KpiCard
              label="Verification Rate"
              value={`${overview?.verificationRate ?? 0}%`}
              tooltip="Verified ÷ Sent × 100"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <KpiCard
              label="New Customers"
              value={fmtNum(overview?.totalNewCustomers ?? 0)}
              delta={comparison?.newCustomersDelta}
              tooltip="New Shopify customers created via OTP login"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <KpiCard
              label="Delivery Rate"
              value={`${overview?.deliveryRate ?? 0}%`}
              tooltip="OTPs sent ÷ requested × 100"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <KpiCard
              label="Blocked Requests"
              value={fmtNum(overview?.totalBlocked ?? 0)}
              tooltip="Requests blocked by rate limits or fraud detection"
            />
          </Layout.Section>
        </Layout>

        {!hasData ? (
          <EmptyState range={range} />
        ) : (
          <>
            {/* ── OTP Activity Line Chart ── */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  OTP Activity
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Daily requested / sent / verified
                </Text>
                <div style={{ height: "300px" }}>
                  <LineChart
                    data={timeSeriesData}
                    tooltipOptions={{ valueFormatter: (v) => v.toLocaleString() }}
                  />
                </div>
              </BlockStack>
            </Card>

            <Layout>
              {/* ── Conversion Funnel ── */}
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Conversion Funnel
                    </Text>
                    <BlockStack gap="300">
                      {(funnel as ConversionFunnelStep[]).map((step) => (
                        <FunnelBar
                          key={step.label}
                          step={step}
                          max={funnelMax}
                        />
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Layout.Section>

              {/* ── Channel Breakdown ── */}
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      Channel Breakdown
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      OTPs sent by channel type
                    </Text>
                    <div style={{ height: "260px" }}>
                      <DonutChart data={channelData} />
                    </div>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>

            {/* ── Top Countries ── */}
            {(countryBreakdown as CountryDataPoint[]).length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Top Countries
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Top 10 countries by OTP volume
                  </Text>
                  <div style={{ height: "280px" }}>
                    <BarChart
                      data={countryData}
                      xAxisOptions={{ hide: false }}
                      tooltipOptions={{ valueFormatter: (v) => v.toLocaleString() }}
                    />
                  </div>
                </BlockStack>
              </Card>
            )}
          </>
        )}
      </BlockStack>
    </Page>
  );
}
