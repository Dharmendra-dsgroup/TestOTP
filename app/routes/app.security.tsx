/**
 * Security Management — /app/security
 *
 * Sections (Tabs):
 *  - Overview: KPI cards + recent security event log
 *  - Blocked IPs: list, add, remove
 *  - Blocked Numbers: list, add, remove
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  DataTable,
  Frame,
  InlineStack,
  Page,
  ResourceItem,
  ResourceList,
  Tabs,
  Text,
  TextField,
  Toast,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import { requireAdminAuth } from "~/middleware/auth.middleware";
import { securityEventRepository } from "~/repositories/security-event.repository";
import { blockedIpRepository } from "~/repositories/blocked-ip.repository";
import { blockedNumberRepository } from "~/repositories/blocked-number.repository";
import { getPlan } from "~/config/plans";
import type { PlanKey } from "~/config/plans";
import type { SecurityEventType } from "~/types/security.types";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop, shopData } = await requireAdminAuth(args);
  const planKey = (shopData?.billing?.planId ?? "free") as PlanKey;
  const plan = getPlan(planKey);

  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);

  const [
    recentEvents,
    eventCount30d,
    eventCount24h,
    eventSummary,
    blockedIps,
    blockedNumbers,
  ] = await Promise.all([
    securityEventRepository.findByShop(shop, { limit: 50, since: since30d }),
    securityEventRepository.countByShop(shop, since30d),
    securityEventRepository.countByShop(shop, since24h),
    securityEventRepository.summarizeByType(shop, since30d),
    blockedIpRepository.findByShop(shop),
    blockedNumberRepository.findByShop(shop),
  ]);

  return json({
    shop,
    planKey,
    hasFraudDetection: plan.fraudDetectionEnabled,
    stats: {
      eventCount30d,
      eventCount24h,
      blockedIpCount: blockedIps.length,
      blockedNumberCount: blockedNumbers.length,
    },
    recentEvents: recentEvents.map((e) => ({
      id: e._id.toString(),
      type: e.type,
      severity: e.severity,
      recipientMasked: e.recipientMasked ?? null,
      recipientType: e.recipientType ?? null,
      ipAddress: e.ipAddress ?? null,
      country: e.country ?? null,
      signal: e.signal,
      createdAt: e.createdAt,
    })),
    eventSummary,
    blockedIps: blockedIps.map((ip) => ({
      id: ip._id.toString(),
      ipAddress: ip.ipAddress,
      reason: ip.reason,
      blockedBy: ip.blockedBy,
      notes: ip.notes ?? null,
      expiresAt: ip.expiresAt ?? null,
      isGlobal: ip.isGlobal,
      createdAt: ip.createdAt,
    })),
    blockedNumbers: blockedNumbers.map((n) => ({
      id: n._id.toString(),
      phone: n.phone,
      reason: n.reason,
      blockedBy: n.blockedBy,
      notes: n.notes ?? null,
      expiresAt: n.expiresAt ?? null,
      createdAt: n.createdAt,
    })),
  });
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async (args: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(args);
  const formData = await args.request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "block_ip") {
    const ipAddress = (formData.get("ipAddress") as string ?? "").trim();
    const notes = (formData.get("notes") as string ?? "").trim() || undefined;

    if (!ipAddress) {
      return json({ ok: false, intent, error: "IP address is required" }, { status: 400 });
    }
    // Basic IP validation (v4 or v6)
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6 = /^[0-9a-fA-F:]{3,39}$/;
    if (!ipv4.test(ipAddress) && !ipv6.test(ipAddress)) {
      return json({ ok: false, intent, error: "Invalid IP address format" }, { status: 400 });
    }

    try {
      await blockedIpRepository.blockIp(shop, ipAddress, "manual", "manual", undefined, false);
      return json({ ok: true, intent, error: null });
    } catch (err) {
      return json(
        { ok: false, intent, error: err instanceof Error ? err.message : "Failed to block IP" },
        { status: 500 }
      );
    }
  }

  if (intent === "unblock_ip") {
    const ipAddress = (formData.get("ipAddress") as string ?? "").trim();
    try {
      await blockedIpRepository.unblockIp(shop, ipAddress);
      return json({ ok: true, intent, error: null });
    } catch (err) {
      return json(
        { ok: false, intent, error: err instanceof Error ? err.message : "Failed to unblock IP" },
        { status: 500 }
      );
    }
  }

  if (intent === "block_number") {
    const phone = (formData.get("phone") as string ?? "").trim();
    const notes = (formData.get("notes") as string ?? "").trim() || undefined;

    if (!phone) {
      return json({ ok: false, intent, error: "Phone number is required" }, { status: 400 });
    }
    if (!phone.startsWith("+")) {
      return json(
        { ok: false, intent, error: "Phone number must be in E.164 format (e.g. +15551234567)" },
        { status: 400 }
      );
    }

    try {
      await blockedNumberRepository.blockNumber(shop, phone, "manual", "manual", undefined, false);
      return json({ ok: true, intent, error: null });
    } catch (err) {
      return json(
        { ok: false, intent, error: err instanceof Error ? err.message : "Failed to block number" },
        { status: 500 }
      );
    }
  }

  if (intent === "unblock_number") {
    const phone = (formData.get("phone") as string ?? "").trim();
    try {
      await blockedNumberRepository.unblockNumber(shop, phone);
      return json({ ok: true, intent, error: null });
    } catch (err) {
      return json(
        { ok: false, intent, error: err instanceof Error ? err.message : "Failed to unblock number" },
        { status: 500 }
      );
    }
  }

  return json({ ok: false, intent, error: "Unknown intent" }, { status: 400 });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ActionData = {
  ok: boolean;
  intent: string;
  error: string | null;
};

function severityTone(
  s: string
): "critical" | "warning" | "attention" | "info" {
  if (s === "critical") return "critical";
  if (s === "high") return "warning";
  if (s === "medium") return "attention";
  return "info";
}

function eventTypeLabel(type: SecurityEventType): string {
  const labels: Record<SecurityEventType, string> = {
    ip_blocked: "IP Blocked",
    phone_blocked: "Phone Blocked",
    country_blocked: "Country Blocked",
    email_domain_blocked: "Email Domain Blocked",
    ip_velocity_exceeded: "IP Velocity",
    phone_velocity_exceeded: "Phone Velocity",
    auto_blocked_ip: "Auto-Blocked IP",
    auto_blocked_phone: "Auto-Blocked Phone",
    rate_limited: "Rate Limited",
    suspicious_pattern: "Suspicious Pattern",
  };
  return labels[type] ?? type;
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "critical" | "warning" | "success";
}) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text
          as="p"
          variant="headingLg"
          fontWeight="bold"
          tone={tone}
        >
          {value.toLocaleString()}
        </Text>
      </BlockStack>
    </Card>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  stats,
  recentEvents,
  eventSummary,
}: {
  stats: ReturnType<typeof useLoaderData<typeof loader>>["stats"];
  recentEvents: ReturnType<typeof useLoaderData<typeof loader>>["recentEvents"];
  eventSummary: ReturnType<typeof useLoaderData<typeof loader>>["eventSummary"];
}) {
  return (
    <BlockStack gap="400">
      {/* KPI row */}
      <InlineStack gap="300">
        <div style={{ flex: 1 }}>
          <KpiCard label="Events (24 h)" value={stats.eventCount24h} tone="warning" />
        </div>
        <div style={{ flex: 1 }}>
          <KpiCard label="Events (30 d)" value={stats.eventCount30d} />
        </div>
        <div style={{ flex: 1 }}>
          <KpiCard label="Blocked IPs" value={stats.blockedIpCount} tone="critical" />
        </div>
        <div style={{ flex: 1 }}>
          <KpiCard label="Blocked Numbers" value={stats.blockedNumberCount} tone="critical" />
        </div>
      </InlineStack>

      {/* Event type breakdown */}
      {eventSummary.length > 0 && (
        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Event Breakdown (30 days)
            </Text>
            <BlockStack gap="200">
              {eventSummary.map((s) => (
                <InlineStack key={s.type} align="space-between">
                  <Text as="span" variant="bodySm">
                    {eventTypeLabel(s.type as SecurityEventType)}
                  </Text>
                  <Badge>{String(s.count)}</Badge>
                </InlineStack>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>
      )}

      {/* Recent events table */}
      <Card padding="0">
        <Box padding="400" paddingBlockEnd="200">
          <Text as="h3" variant="headingSm">
            Recent Events
          </Text>
        </Box>
        {recentEvents.length === 0 ? (
          <Box padding="400">
            <Text as="p" variant="bodySm" tone="subdued">
              No security events in the past 30 days.
            </Text>
          </Box>
        ) : (
          <DataTable
            columnContentTypes={["text", "text", "text", "text", "text", "text"]}
            headings={["Type", "Severity", "Recipient", "IP", "Country", "Time"]}
            rows={recentEvents.map((e) => [
              eventTypeLabel(e.type as SecurityEventType),
              <Badge tone={severityTone(e.severity)} key={e.id}>
                {e.severity}
              </Badge>,
              e.recipientMasked ?? "—",
              e.ipAddress ?? "—",
              e.country ?? "—",
              fmtDate(e.createdAt),
            ])}
          />
        )}
      </Card>
    </BlockStack>
  );
}

// ─── Blocked IPs Tab ──────────────────────────────────────────────────────────

function BlockedIpsTab({
  blockedIps,
  fetcher,
}: {
  blockedIps: ReturnType<typeof useLoaderData<typeof loader>>["blockedIps"];
  fetcher: ReturnType<typeof useFetcher<ActionData>>;
}) {
  const [ipInput, setIpInput] = useState("");

  const handleBlock = useCallback(() => {
    if (!ipInput.trim()) return;
    const fd = new FormData();
    fd.set("intent", "block_ip");
    fd.set("ipAddress", ipInput.trim());
    fetcher.submit(fd, { method: "post" });
    setIpInput("");
  }, [ipInput, fetcher]);

  const handleUnblock = useCallback(
    (ip: string) => {
      const fd = new FormData();
      fd.set("intent", "unblock_ip");
      fd.set("ipAddress", ip);
      fetcher.submit(fd, { method: "post" });
    },
    [fetcher]
  );

  return (
    <BlockStack gap="400">
      <InlineStack gap="200" blockAlign="end">
        <div style={{ flex: 1, maxWidth: "320px" }}>
          <TextField
            label="Block an IP address"
            value={ipInput}
            onChange={setIpInput}
            autoComplete="off"
            placeholder="192.168.1.1 or 2001:db8::1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleBlock();
              }
            }}
          />
        </div>
        <div style={{ paddingBottom: "20px" }}>
          <Button
            onClick={handleBlock}
            tone="critical"
            loading={
              fetcher.state === "submitting" &&
              fetcher.formData?.get("intent") === "block_ip"
            }
            disabled={!ipInput.trim()}
          >
            Block IP
          </Button>
        </div>
      </InlineStack>

      {blockedIps.length === 0 ? (
        <Card>
          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
            No IPs blocked for this store.
          </Text>
        </Card>
      ) : (
        <Card padding="0">
          <ResourceList
            resourceName={{ singular: "IP address", plural: "IP addresses" }}
            items={blockedIps}
            renderItem={(ip) => (
              <ResourceItem
                id={ip.id}
                accessibilityLabel={`Blocked IP: ${ip.ipAddress}`}
                shortcutActions={[
                  { content: "Unblock", onAction: () => handleUnblock(ip.ipAddress) },
                ]}
              >
                <InlineStack gap="300" blockAlign="center">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    {ip.ipAddress}
                  </Text>
                  <Badge
                    tone={ip.blockedBy === "auto" ? "warning" : "critical"}
                  >
                    {ip.blockedBy === "auto" ? "Auto" : "Manual"}
                  </Badge>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {ip.reason.replace(/_/g, " ")} · {fmtDate(ip.createdAt)}
                  </Text>
                  {ip.expiresAt && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      Expires {fmtDate(ip.expiresAt)}
                    </Text>
                  )}
                </InlineStack>
              </ResourceItem>
            )}
          />
        </Card>
      )}
    </BlockStack>
  );
}

// ─── Blocked Numbers Tab ──────────────────────────────────────────────────────

function BlockedNumbersTab({
  blockedNumbers,
  fetcher,
}: {
  blockedNumbers: ReturnType<typeof useLoaderData<typeof loader>>["blockedNumbers"];
  fetcher: ReturnType<typeof useFetcher<ActionData>>;
}) {
  const [phoneInput, setPhoneInput] = useState("");

  const handleBlock = useCallback(() => {
    if (!phoneInput.trim()) return;
    const fd = new FormData();
    fd.set("intent", "block_number");
    fd.set("phone", phoneInput.trim());
    fetcher.submit(fd, { method: "post" });
    setPhoneInput("");
  }, [phoneInput, fetcher]);

  const handleUnblock = useCallback(
    (phone: string) => {
      const fd = new FormData();
      fd.set("intent", "unblock_number");
      fd.set("phone", phone);
      fetcher.submit(fd, { method: "post" });
    },
    [fetcher]
  );

  return (
    <BlockStack gap="400">
      <InlineStack gap="200" blockAlign="end">
        <div style={{ flex: 1, maxWidth: "320px" }}>
          <TextField
            label="Block a phone number"
            value={phoneInput}
            onChange={setPhoneInput}
            autoComplete="off"
            placeholder="+15551234567"
            helpText="Must be in E.164 international format"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleBlock();
              }
            }}
          />
        </div>
        <div style={{ paddingBottom: "36px" }}>
          <Button
            onClick={handleBlock}
            tone="critical"
            loading={
              fetcher.state === "submitting" &&
              fetcher.formData?.get("intent") === "block_number"
            }
            disabled={!phoneInput.trim()}
          >
            Block Number
          </Button>
        </div>
      </InlineStack>

      {blockedNumbers.length === 0 ? (
        <Card>
          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
            No phone numbers blocked for this store.
          </Text>
        </Card>
      ) : (
        <Card padding="0">
          <ResourceList
            resourceName={{ singular: "phone number", plural: "phone numbers" }}
            items={blockedNumbers}
            renderItem={(n) => (
              <ResourceItem
                id={n.id}
                accessibilityLabel={`Blocked number: ${n.phone}`}
                shortcutActions={[
                  { content: "Unblock", onAction: () => handleUnblock(n.phone) },
                ]}
              >
                <InlineStack gap="300" blockAlign="center">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    {n.phone}
                  </Text>
                  <Badge tone={n.blockedBy === "auto" ? "warning" : "critical"}>
                    {n.blockedBy === "auto" ? "Auto" : "Manual"}
                  </Badge>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {n.reason.replace(/_/g, " ")} · {fmtDate(n.createdAt)}
                  </Text>
                  {n.expiresAt && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      Expires {fmtDate(n.expiresAt)}
                    </Text>
                  )}
                </InlineStack>
              </ResourceItem>
            )}
          />
        </Card>
      )}
    </BlockStack>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", content: "Overview" },
  { id: "blocked-ips", content: "Blocked IPs" },
  { id: "blocked-numbers", content: "Blocked Numbers" },
];

export default function SecurityPage() {
  const { stats, recentEvents, eventSummary, blockedIps, blockedNumbers, hasFraudDetection } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<ActionData>();
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const tabParam = searchParams.get("tab") ?? "overview";
  const selectedIndex = TABS.findIndex((t) => t.id === tabParam);
  const selected = selectedIndex === -1 ? 0 : selectedIndex;

  // Toast on fetcher actions
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const d = fetcher.data;
      if (d.ok) {
        const msgs: Record<string, string> = {
          block_ip: "IP address blocked.",
          unblock_ip: "IP address unblocked.",
          block_number: "Phone number blocked.",
          unblock_number: "Phone number unblocked.",
        };
        setToast({ message: msgs[d.intent] ?? "Done." });
      } else {
        setToast({ message: d.error ?? "Action failed", error: true });
      }
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Frame>
      {toast && (
        <Toast
          content={toast.message}
          error={toast.error}
          onDismiss={() => setToast(null)}
          duration={3000}
        />
      )}

      <Page
        title="Security"
        subtitle="Monitor fraud activity and manage blocklists"
        secondaryActions={[
          {
            content: "Security Settings",
            url: "/app/settings/security",
          },
        ]}
      >
        <BlockStack gap="400">
          {!hasFraudDetection && (
            <Banner
              title="Advanced fraud detection requires Growth or Enterprise plan"
              tone="info"
              action={{ content: "View plans", url: "/app/billing" }}
            >
              <Text as="p" variant="bodySm">
                Upgrade to unlock velocity limiting, auto-block, and real-time
                fraud event logging. Manual IP and phone blocklists are
                available on all plans.
              </Text>
            </Banner>
          )}

          <Card padding="0">
            <Tabs
              tabs={TABS}
              selected={selected}
              onSelect={(index) =>
                setSearchParams({ tab: TABS[index].id }, { replace: true })
              }
            >
              <Box padding="400">
                {selected === 0 && (
                  <OverviewTab
                    stats={stats}
                    recentEvents={recentEvents}
                    eventSummary={eventSummary}
                  />
                )}
                {selected === 1 && (
                  <BlockedIpsTab
                    blockedIps={blockedIps}
                    fetcher={fetcher}
                  />
                )}
                {selected === 2 && (
                  <BlockedNumbersTab
                    blockedNumbers={blockedNumbers}
                    fetcher={fetcher}
                  />
                )}
              </Box>
            </Tabs>
          </Card>
        </BlockStack>
      </Page>
    </Frame>
  );
}
