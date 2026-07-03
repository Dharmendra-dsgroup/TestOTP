/**
 * SMS Provider Settings — /app/settings/providers
 *
 * Renders within the Settings tab layout (app.settings.tsx Outlet).
 *
 * Features:
 *  - List all configured SMS providers with health status, stats, role badges
 *  - Add provider via Polaris Modal (type selector + dynamic credential fields)
 *  - Edit existing provider (re-enter credentials to update, blank = keep existing)
 *  - Test connection via useFetcher (no page reload)
 *  - Delete (soft) with confirmation
 *  - Plan limit banner when at max providers
 *
 * Actions: add | update | delete | test
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Divider,
  FormLayout,
  InlineStack,
  Modal,
  Select,
  Text,
  TextField,
  Tooltip,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useCallback, useEffect, useState } from "react";
import { requireAdminAuth } from "~/middleware/auth.middleware";
import { smsProviderService } from "~/services/sms-provider.service";
import { getPlan } from "~/config/plans";
import type { PlanKey } from "~/config/plans";
import {
  PROVIDER_TYPE_OPTIONS,
  getProviderConfig,
} from "~/config/provider-fields.config";
import type { SmsProviderRole, SmsProviderType } from "~/types/sms.types";
import type {
  AddProviderInput,
  ProviderListItem,
} from "~/services/sms-provider.service";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop, shopData } = await requireAdminAuth(args);

  const planKey = (shopData?.billing?.planId ?? "free") as PlanKey;
  const plan = getPlan(planKey);
  const maxProviders = plan.maxProviders;

  const result = await smsProviderService.listForShop(shop);
  const providers = result.success ? result.data : [];

  return json({
    shop,
    planKey,
    planName: plan.name,
    maxProviders,
    providers,
    atLimit: maxProviders !== -1 && providers.length >= maxProviders,
  });
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async (args: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(args);
  const formData = await args.request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add") {
    const type = formData.get("type") as SmsProviderType;
    const name = formData.get("name") as string;
    const role = (formData.get("role") ?? "primary") as SmsProviderRole;

    const credentials: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("cred_") && typeof value === "string" && value.trim()) {
        credentials[key.slice(5)] = value.trim();
      }
    }

    const result = await smsProviderService.addProvider(shop, {
      name: name?.trim(),
      type,
      role,
      credentials,
      senderId: credentials.senderId,
    } as AddProviderInput);

    if (!result.success) {
      return json({ ok: false, error: result.error, intent }, { status: 422 });
    }
    return json({ ok: true, error: null, intent, provider: result.data });
  }

  if (intent === "update") {
    const providerId = formData.get("providerId") as string;
    const name = formData.get("name") as string;
    const role = formData.get("role") as SmsProviderRole;

    const credentials: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("cred_") && typeof value === "string" && value.trim()) {
        credentials[key.slice(5)] = value.trim();
      }
    }

    const result = await smsProviderService.updateProvider(shop, providerId, {
      name: name?.trim(),
      role,
      credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
    });

    if (!result.success) {
      return json({ ok: false, error: result.error, intent }, { status: 422 });
    }
    return json({ ok: true, error: null, intent, provider: result.data });
  }

  if (intent === "delete") {
    const providerId = formData.get("providerId") as string;
    const result = await smsProviderService.deleteProvider(shop, providerId);
    if (!result.success) {
      return json({ ok: false, error: result.error, intent }, { status: 422 });
    }
    return json({ ok: true, error: null, intent });
  }

  if (intent === "test") {
    const providerId = formData.get("providerId") as string | null;
    const type = formData.get("type") as SmsProviderType;

    const credentials: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("cred_") && typeof value === "string" && value.trim()) {
        credentials[key.slice(5)] = value.trim();
      }
    }
    const credJson =
      Object.keys(credentials).length > 0
        ? JSON.stringify(credentials)
        : undefined;

    const result = await smsProviderService.testProvider(
      shop,
      type,
      credJson,
      credJson ? undefined : (providerId ?? undefined)
    );

    return json({
      ok: result.success,
      error: result.success ? null : result.error,
      intent,
      healthy: result.success ? result.data.healthy : false,
      latencyMs: result.success ? result.data.latencyMs : undefined,
      errorMessage: result.success
        ? (result.data.errorMessage ?? null)
        : result.error,
    });
  }

  return json(
    { ok: false, error: "Unknown intent", intent: "" },
    { status: 400 }
  );
};

// ─── Shared types ─────────────────────────────────────────────────────────────

type TestResult = {
  healthy: boolean;
  latencyMs?: number;
  errorMessage?: string | null;
};

type ActionData = {
  ok: boolean;
  error: string | null;
  intent: string;
  provider?: ProviderListItem;
  healthy?: boolean;
  latencyMs?: number;
  errorMessage?: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { label: "Primary", value: "primary" },
  { label: "Secondary", value: "secondary" },
  { label: "Fallback", value: "fallback" },
];

const PROVIDER_SELECT_OPTIONS = [
  { label: "Select provider type…", value: "" },
  ...PROVIDER_TYPE_OPTIONS.map((p) => ({ label: p.label, value: p.value })),
];

function roleBadgeTone(
  role: SmsProviderRole
): "success" | "info" | "attention" {
  if (role === "primary") return "success";
  if (role === "secondary") return "info";
  return "attention";
}

// ─── Provider Card ────────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: ProviderListItem;
  onEdit: (p: ProviderListItem) => void;
  onDelete: (id: string) => void;
  onTest: (p: ProviderListItem) => void;
  testResult?: TestResult | null;
  testing?: boolean;
}

function ProviderCard({
  provider,
  onEdit,
  onDelete,
  onTest,
  testResult,
  testing,
}: ProviderCardProps) {
  const total = provider.totalSent + provider.totalFailed;
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h3" variant="headingSm">
              {provider.name}
            </Text>
            <Badge tone={roleBadgeTone(provider.role)}>
              {provider.role.charAt(0).toUpperCase() + provider.role.slice(1)}
            </Badge>
            <Badge tone={provider.isHealthy ? "success" : "critical"}>
              {provider.isHealthy ? "Healthy" : "Unhealthy"}
            </Badge>
          </InlineStack>
          <ButtonGroup>
            <Tooltip content="Send a health check to this provider">
              <Button
                size="slim"
                onClick={() => onTest(provider)}
                loading={testing}
                disabled={testing}
              >
                Test
              </Button>
            </Tooltip>
            <Button size="slim" onClick={() => onEdit(provider)}>
              Edit
            </Button>
            <Button
              size="slim"
              tone="critical"
              variant="plain"
              onClick={() => onDelete(provider.id)}
            >
              Remove
            </Button>
          </ButtonGroup>
        </InlineStack>

        <InlineStack gap="400">
          <Text as="span" variant="bodySm" tone="subdued">
            {provider.type.replace(/_/g, " ").toUpperCase()}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {total > 0
              ? `${provider.totalSent.toLocaleString()} sent · ${provider.totalFailed.toLocaleString()} failed · ${provider.successRate}% success`
              : "No messages sent yet"}
          </Text>
        </InlineStack>

        {!provider.isHealthy && provider.lastErrorMessage && (
          <Text as="p" variant="bodySm" tone="critical">
            Last error: {provider.lastErrorMessage}
          </Text>
        )}

        {testResult && (
          <Banner tone={testResult.healthy ? "success" : "critical"}>
            <Text as="p" variant="bodySm">
              {testResult.healthy
                ? `Connection successful${testResult.latencyMs !== undefined ? ` (${testResult.latencyMs}ms)` : ""}`
                : `Connection failed: ${testResult.errorMessage ?? "Unknown error"}`}
            </Text>
          </Banner>
        )}
      </BlockStack>
    </Card>
  );
}

// ─── Provider Modal ───────────────────────────────────────────────────────────

interface ProviderModalProps {
  open: boolean;
  editing: ProviderListItem | null;
  onClose: () => void;
  onSaved: () => void;
}

function ProviderModal({
  open,
  editing,
  onClose,
  onSaved,
}: ProviderModalProps) {
  const isEditing = editing !== null;

  const [selectedType, setSelectedType] = useState<string>(
    editing?.type ?? ""
  );
  const [name, setName] = useState(editing?.name ?? "");
  const [role, setRole] = useState<string>(editing?.role ?? "primary");
  const [credFields, setCredFields] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const saveFetcher = useFetcher<ActionData>();
  const testFetcher = useFetcher<ActionData>();

  // Sync state when modal opens or editing target changes
  useEffect(() => {
    if (open) {
      setSelectedType(editing?.type ?? "");
      setName(editing?.name ?? "");
      setRole(editing?.role ?? "primary");
      setCredFields({});
      setTestResult(null);
      setActionError(null);
    }
  }, [open, editing]);

  // Handle save response
  useEffect(() => {
    if (saveFetcher.state === "idle" && saveFetcher.data) {
      if (saveFetcher.data.ok) {
        onSaved();
        onClose();
      } else {
        setActionError(saveFetcher.data.error ?? "Save failed");
      }
    }
  }, [saveFetcher.state, saveFetcher.data, onSaved, onClose]);

  // Handle test response
  useEffect(() => {
    if (testFetcher.state === "idle" && testFetcher.data?.intent === "test") {
      setTestResult({
        healthy: testFetcher.data.healthy ?? false,
        latencyMs: testFetcher.data.latencyMs,
        errorMessage: testFetcher.data.errorMessage,
      });
    }
  }, [testFetcher.state, testFetcher.data]);

  const cfg = selectedType
    ? getProviderConfig(selectedType as SmsProviderType)
    : null;
  const isSaving = saveFetcher.state === "submitting";
  const isTesting = testFetcher.state === "submitting";

  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", isEditing ? "update" : "add");
    if (isEditing) fd.set("providerId", editing.id);
    fd.set("type", selectedType);
    fd.set("name", name);
    fd.set("role", role);
    for (const [k, v] of Object.entries(credFields)) {
      if (v.trim()) fd.set(`cred_${k}`, v.trim());
    }
    saveFetcher.submit(fd, { method: "post" });
  }, [isEditing, editing, selectedType, name, role, credFields, saveFetcher]);

  const handleTest = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "test");
    fd.set("type", selectedType);
    if (isEditing) fd.set("providerId", editing.id);
    for (const [k, v] of Object.entries(credFields)) {
      if (v.trim()) fd.set(`cred_${k}`, v.trim());
    }
    setTestResult(null);
    testFetcher.submit(fd, { method: "post" });
  }, [isEditing, editing, selectedType, credFields, testFetcher]);

  const canSave = !!selectedType && !!name.trim() && !isSaving;
  const canTest =
    !!selectedType &&
    (isEditing || Object.values(credFields).some((v) => v.trim()));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? `Edit: ${editing.name}` : "Add SMS Provider"}
      primaryAction={{
        content: isEditing ? "Save changes" : "Add provider",
        onAction: handleSave,
        loading: isSaving,
        disabled: !canSave,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <FormLayout>
          <Select
            label="Provider type"
            options={PROVIDER_SELECT_OPTIONS}
            value={selectedType}
            onChange={(v) => {
              setSelectedType(v);
              setCredFields({});
              setTestResult(null);
            }}
            disabled={isEditing}
          />
          <TextField
            label="Display name"
            value={name}
            onChange={setName}
            autoComplete="off"
            placeholder="e.g. Twilio Production"
            requiredIndicator
          />
          <Select
            label="Role"
            options={ROLE_OPTIONS}
            value={role}
            onChange={setRole}
            helpText="Primary is used first; Secondary on failover; Fallback as last resort."
          />
        </FormLayout>
      </Modal.Section>

      {cfg && (
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Credentials
            </Text>

            {isEditing && (
              <Banner tone="info">
                <Text as="p" variant="bodySm">
                  Leave fields blank to keep your existing saved credentials.
                </Text>
              </Banner>
            )}

            <FormLayout>
              {cfg.fields.map((f) => (
                <TextField
                  key={f.key}
                  label={f.label}
                  type={f.sensitive ? "password" : "text"}
                  value={credFields[f.key] ?? ""}
                  onChange={(v) =>
                    setCredFields((prev) => ({ ...prev, [f.key]: v }))
                  }
                  placeholder={
                    isEditing && f.sensitive
                      ? "••• leave blank to keep existing •••"
                      : (f.placeholder ?? "")
                  }
                  helpText={f.helpText}
                  autoComplete="off"
                  multiline={f.multiline ? 3 : undefined}
                  requiredIndicator={f.required && !isEditing}
                />
              ))}
            </FormLayout>

            <InlineStack align="end">
              <Button
                onClick={handleTest}
                loading={isTesting}
                disabled={!canTest || isTesting}
                variant="secondary"
                size="slim"
              >
                Test connection
              </Button>
            </InlineStack>

            {testResult && (
              <Banner tone={testResult.healthy ? "success" : "critical"}>
                <Text as="p" variant="bodySm">
                  {testResult.healthy
                    ? `Connection successful${testResult.latencyMs !== undefined ? ` (${testResult.latencyMs}ms)` : ""}`
                    : `Connection failed: ${testResult.errorMessage ?? "Unknown error"}`}
                </Text>
              </Banner>
            )}
          </BlockStack>
        </Modal.Section>
      )}

      {actionError && (
        <Modal.Section>
          <Banner tone="critical">
            <Text as="p" variant="bodySm">
              {actionError}
            </Text>
          </Banner>
        </Modal.Section>
      )}
    </Modal>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ProvidersSettingsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const deleteFetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] =
    useState<ProviderListItem | null>(null);
  const [cardTestResults, setCardTestResults] = useState<
    Record<string, TestResult>
  >({});
  const [testingCardId, setTestingCardId] = useState<string | null>(null);

  const cardTestFetcher = useFetcher<ActionData>();

  // Handle card-level test results
  useEffect(() => {
    if (
      cardTestFetcher.state === "idle" &&
      cardTestFetcher.data?.intent === "test" &&
      testingCardId
    ) {
      const d = cardTestFetcher.data;
      setCardTestResults((prev) => ({
        ...prev,
        [testingCardId]: {
          healthy: d.healthy ?? false,
          latencyMs: d.latencyMs,
          errorMessage: d.errorMessage,
        },
      }));
      setTestingCardId(null);
    }
  }, [cardTestFetcher.state, cardTestFetcher.data, testingCardId]);

  // Handle delete results
  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data) {
      if (deleteFetcher.data.ok) {
        shopify.toast.show("Provider removed.");
      } else {
        shopify.toast.show(deleteFetcher.data.error ?? "Delete failed", { isError: true });
      }
    }
  }, [deleteFetcher.state, deleteFetcher.data, shopify]);

  const handleOpenAdd = useCallback(() => {
    setEditingProvider(null);
    setModalOpen(true);
  }, []);

  const handleOpenEdit = useCallback((p: ProviderListItem) => {
    setEditingProvider(p);
    setModalOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setModalOpen(false);
    setEditingProvider(null);
  }, []);

  const handleSaved = useCallback(() => {
    shopify.toast.show(editingProvider ? "Provider updated." : "Provider added.");
  }, [editingProvider, shopify]);

  const handleDelete = useCallback(
    (id: string) => {
      if (!window.confirm("Remove this SMS provider? This cannot be undone.")) {
        return;
      }
      const fd = new FormData();
      fd.set("intent", "delete");
      fd.set("providerId", id);
      deleteFetcher.submit(fd, { method: "post" });
    },
    [deleteFetcher]
  );

  const handleCardTest = useCallback(
    (p: ProviderListItem) => {
      setTestingCardId(p.id);
      setCardTestResults((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      const fd = new FormData();
      fd.set("intent", "test");
      fd.set("type", p.type);
      fd.set("providerId", p.id);
      cardTestFetcher.submit(fd, { method: "post" });
    },
    [cardTestFetcher]
  );

  const { providers, atLimit, maxProviders, planName } = loaderData;

  return (
    <Box padding="400">
        <BlockStack gap="400">
          {/* ── Header ── */}
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                SMS Providers
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {maxProviders === -1
                  ? `${providers.length} provider${providers.length !== 1 ? "s" : ""} configured`
                  : `${providers.length} / ${maxProviders} providers configured (${planName} plan)`}
              </Text>
            </BlockStack>
            <Tooltip
              content={
                atLimit
                  ? `Upgrade to add more than ${maxProviders} provider${maxProviders !== 1 ? "s" : ""}`
                  : "Add a new SMS provider"
              }
            >
              <Button
                variant="primary"
                onClick={handleOpenAdd}
                disabled={atLimit}
              >
                Add Provider
              </Button>
            </Tooltip>
          </InlineStack>

          {/* ── Plan limit banner ── */}
          {atLimit && (
            <Banner
              title={`Provider limit reached on ${planName} plan`}
              tone="warning"
              action={{ content: "Upgrade plan", url: "/app/billing" }}
            >
              <Text as="p" variant="bodyMd">
                Your plan allows up to {maxProviders} SMS provider
                {maxProviders !== 1 ? "s" : ""}. Upgrade to enable automatic
                failover with additional providers.
              </Text>
            </Banner>
          )}

          {/* ── Provider list ── */}
          {providers.length === 0 ? (
            <Card>
              <BlockStack gap="300" inlineAlign="center">
                <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                  No SMS providers configured yet.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                  Add a provider to start sending OTPs to your customers.
                </Text>
                <Button variant="primary" onClick={handleOpenAdd}>
                  Add your first provider
                </Button>
              </BlockStack>
            </Card>
          ) : (
            <BlockStack gap="300">
              {(providers as ProviderListItem[]).map((p) => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  onEdit={handleOpenEdit}
                  onDelete={handleDelete}
                  onTest={handleCardTest}
                  testResult={cardTestResults[p.id] ?? null}
                  testing={
                    testingCardId === p.id &&
                    cardTestFetcher.state === "submitting"
                  }
                />
              ))}
            </BlockStack>
          )}

          {/* ── Failover info ── */}
          {providers.length > 1 && (
            <>
              <Divider />
              <Banner tone="info">
                <Text as="p" variant="bodySm">
                  <strong>Automatic failover:</strong> OTPs are sent using
                  Primary first. If it fails, Secondary is tried, then Fallback.
                  Health status updates automatically after each delivery
                  attempt.
                </Text>
              </Banner>
            </>
          )}
        </BlockStack>

        <ProviderModal
          open={modalOpen}
          editing={editingProvider}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      </Box>
  );
}
