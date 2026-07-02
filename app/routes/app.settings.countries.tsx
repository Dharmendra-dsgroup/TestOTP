import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  BlockStack,
  Box,
  Button,
  Divider,
  InlineStack,
  Tag,
  Text,
  Toast,
  Frame,
  Banner,
  Combobox,
  Listbox,
  Icon,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { useState, useCallback, useMemo } from "react";
import { requireAdminAuth } from "~/middleware/auth.middleware";
import { settingsService } from "~/services/settings.service";
import { auditLogService } from "~/services/audit-log.service";
import { parseFormDataArray } from "~/validators/common.validator";
import { countrySettingsSchema } from "~/validators/settings.validator";

const COUNTRIES = [
  { code: "US", name: "United States", dialCode: "+1" },
  { code: "GB", name: "United Kingdom", dialCode: "+44" },
  { code: "IN", name: "India", dialCode: "+91" },
  { code: "AU", name: "Australia", dialCode: "+61" },
  { code: "CA", name: "Canada", dialCode: "+1" },
  { code: "DE", name: "Germany", dialCode: "+49" },
  { code: "FR", name: "France", dialCode: "+33" },
  { code: "IT", name: "Italy", dialCode: "+39" },
  { code: "ES", name: "Spain", dialCode: "+34" },
  { code: "BR", name: "Brazil", dialCode: "+55" },
  { code: "MX", name: "Mexico", dialCode: "+52" },
  { code: "JP", name: "Japan", dialCode: "+81" },
  { code: "CN", name: "China", dialCode: "+86" },
  { code: "KR", name: "South Korea", dialCode: "+82" },
  { code: "SG", name: "Singapore", dialCode: "+65" },
  { code: "MY", name: "Malaysia", dialCode: "+60" },
  { code: "ID", name: "Indonesia", dialCode: "+62" },
  { code: "PH", name: "Philippines", dialCode: "+63" },
  { code: "TH", name: "Thailand", dialCode: "+66" },
  { code: "VN", name: "Vietnam", dialCode: "+84" },
  { code: "AE", name: "UAE", dialCode: "+971" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966" },
  { code: "PK", name: "Pakistan", dialCode: "+92" },
  { code: "BD", name: "Bangladesh", dialCode: "+880" },
  { code: "NG", name: "Nigeria", dialCode: "+234" },
  { code: "KE", name: "Kenya", dialCode: "+254" },
  { code: "ZA", name: "South Africa", dialCode: "+27" },
  { code: "EG", name: "Egypt", dialCode: "+20" },
  { code: "GH", name: "Ghana", dialCode: "+233" },
  { code: "NL", name: "Netherlands", dialCode: "+31" },
  { code: "SE", name: "Sweden", dialCode: "+46" },
  { code: "NO", name: "Norway", dialCode: "+47" },
  { code: "DK", name: "Denmark", dialCode: "+45" },
  { code: "PT", name: "Portugal", dialCode: "+351" },
  { code: "PL", name: "Poland", dialCode: "+48" },
  { code: "TR", name: "Turkey", dialCode: "+90" },
  { code: "IL", name: "Israel", dialCode: "+972" },
  { code: "NZ", name: "New Zealand", dialCode: "+64" },
  { code: "RU", name: "Russia", dialCode: "+7" },
  { code: "FI", name: "Finland", dialCode: "+358" },
];

function CountryMultiSelect({
  label,
  helpText,
  selected,
  onChange,
  name,
  tone,
}: {
  label: string;
  helpText: string;
  selected: string[];
  onChange: (codes: string[]) => void;
  name: string;
  tone?: "success" | "critical";
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query) return COUNTRIES;
    const q = query.toLowerCase();
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.dialCode.includes(q)
    );
  }, [query]);

  const handleSelect = useCallback(
    (code: string) => {
      const next = selected.includes(code)
        ? selected.filter((c) => c !== code)
        : [...selected, code];
      onChange(next);
    },
    [selected, onChange]
  );

  const countryName = (code: string) =>
    COUNTRIES.find((c) => c.code === code)?.name ?? code;

  return (
    <BlockStack gap="300">
      <Text as="p" variant="bodyMd" fontWeight="medium">
        {label}
      </Text>
      <Text as="p" variant="bodySm" tone="subdued">
        {helpText}
      </Text>

      {/* Hidden inputs for form submission */}
      {selected.map((code) => (
        <input key={code} type="hidden" name={name} value={code} />
      ))}

      <Combobox
        allowMultiple
        activator={
          <Combobox.TextField
            prefix={<Icon source={SearchIcon} />}
            onChange={setQuery}
            label="Search countries"
            labelHidden
            value={query}
            placeholder="Search by country name or dial code"
            autoComplete="off"
          />
        }
      >
        {filtered.length > 0 && (
          <Listbox onSelect={handleSelect}>
            {filtered.map(({ code, name, dialCode }) => (
              <Listbox.Option
                key={code}
                value={code}
                selected={selected.includes(code)}
                accessibilityLabel={name}
              >
                <Listbox.TextOption selected={selected.includes(code)}>
                  {name} ({dialCode})
                </Listbox.TextOption>
              </Listbox.Option>
            ))}
          </Listbox>
        )}
        {filtered.length === 0 && (
          <Listbox>
            <Listbox.Action value="">No countries found</Listbox.Action>
          </Listbox>
        )}
      </Combobox>

      {selected.length > 0 && (
        <InlineStack gap="200" wrap>
          {selected.map((code) => (
            <Tag key={code} onRemove={() => handleSelect(code)}>
              {countryName(code)}
            </Tag>
          ))}
        </InlineStack>
      )}
    </BlockStack>
  );
}

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop, shopData } = await requireAdminAuth(args);
  return json({
    shop,
    allowedCountries: shopData?.settings?.allowedCountries ?? [],
    blockedCountries: shopData?.settings?.blockedCountries ?? [],
  });
};

export const action = async (args: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(args);
  const formData = await args.request.formData();

  const { data, errors } = parseFormDataArray(
    countrySettingsSchema,
    formData,
    ["allowedCountries", "blockedCountries"]
  );

  if (errors) {
    return json({ success: false, errors }, { status: 400 });
  }

  const result = await settingsService.updateCountrySettings(shop, {
    allowedCountries: data.allowedCountries,
    blockedCountries: data.blockedCountries,
  });

  if (!result.success) {
    return json({ success: false, errors: { form: result.error } }, { status: 500 });
  }

  await auditLogService.logAction(shop, "settings.updated", "success", {
    targetType: "countrySettings",
    metadata: {
      allowedCount: data.allowedCountries.length,
      blockedCount: data.blockedCountries.length,
    },
  });

  return json({ success: true, errors: null });
};

export default function CountriesSettings() {
  const { allowedCountries: initAllowed, blockedCountries: initBlocked } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const isSaving = navigation.state === "submitting";
  const [toastActive, setToastActive] = useState(false);
  const [allowed, setAllowed] = useState<string[]>(initAllowed);
  const [blocked, setBlocked] = useState<string[]>(initBlocked);

  if (actionData?.success && !toastActive) {
    setToastActive(true);
  }

  return (
    <Frame>
      {toastActive && (
        <Toast
          content="Country settings saved"
          onDismiss={() => setToastActive(false)}
          duration={3000}
        />
      )}

      <Box padding="600">
        <Form method="post">
          <BlockStack gap="600">
            {actionData?.errors?.form && (
              <Banner title="Save failed" tone="critical">
                <Text as="p">{actionData.errors.form}</Text>
              </Banner>
            )}

            <Banner title="How country lists work" tone="info">
              <Text as="p" variant="bodyMd">
                <strong>Allowed list</strong>: Only customers from these countries can request OTPs.
                Leave empty to allow all countries.{" "}
                <strong>Blocked list</strong>: Customers from these countries are always rejected.
              </Text>
            </Banner>

            {/* Allowed Countries */}
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Allowed Countries
              </Text>
              <Divider />
              <CountryMultiSelect
                label="Allowed countries"
                helpText="Only OTP requests from these countries will be accepted. Empty = all countries allowed."
                selected={allowed}
                onChange={setAllowed}
                name="allowedCountries"
                tone="success"
              />
            </BlockStack>

            {/* Blocked Countries */}
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Blocked Countries
              </Text>
              <Divider />
              <CountryMultiSelect
                label="Blocked countries"
                helpText="OTP requests from these countries will always be rejected."
                selected={blocked}
                onChange={setBlocked}
                name="blockedCountries"
                tone="critical"
              />
            </BlockStack>

            <InlineStack align="end">
              <Button submit variant="primary" loading={isSaving}>
                Save Country Settings
              </Button>
            </InlineStack>
          </BlockStack>
        </Form>
      </Box>
    </Frame>
  );
}
