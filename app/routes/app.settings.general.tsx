import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  BlockStack,
  Box,
  Button,
  Checkbox,
  Divider,
  FormLayout,
  InlineStack,
  Select,
  Text,
  TextField,
  Banner,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { requireAdminAuth } from "~/middleware/auth.middleware";
import { settingsService } from "~/services/settings.service";
import { auditLogService } from "~/services/audit-log.service";
import { parseFormData } from "~/validators/common.validator";
import { generalSettingsSchema } from "~/validators/settings.validator";

const WIDGET_OPTIONS = [
  { label: "Popup", value: "popup" },
  { label: "Inline", value: "inline" },
  { label: "Slide Over", value: "slide-over" },
  { label: "Floating Button", value: "floating" },
];

const POSITION_OPTIONS = [
  { label: "Center", value: "center" },
  { label: "Top", value: "top" },
  { label: "Bottom Left", value: "bottom-left" },
  { label: "Bottom Right", value: "bottom-right" },
];

const LANGUAGE_OPTIONS = [
  { label: "English", value: "en" },
  { label: "Spanish", value: "es" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Portuguese", value: "pt" },
  { label: "Arabic", value: "ar" },
  { label: "Hindi", value: "hi" },
  { label: "Japanese", value: "ja" },
  { label: "Korean", value: "ko" },
  { label: "Chinese (Simplified)", value: "zh" },
];

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop, shopData } = await requireAdminAuth(args);
  return json({ shop, settings: shopData?.settings ?? null });
};

export const action = async (args: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(args);
  const formData = await args.request.formData();

  const { data, errors } = parseFormData(generalSettingsSchema, formData);

  if (errors) {
    return json({ success: false, errors }, { status: 400 });
  }

  const result = await settingsService.updateGeneralSettings(shop, {
    buttonText: data.buttonText,
    brandColor: data.brandColor || undefined,
    logoUrl: data.logoUrl || undefined,
    darkMode: data.darkMode,
    widgetType: data.widgetType,
    popupPosition: data.popupPosition,
    customCss: data.customCss || undefined,
    customJs: data.customJs || undefined,
    language: data.language,
  });

  if (!result.success) {
    return json({ success: false, errors: { form: result.error } }, { status: 500 });
  }

  await auditLogService.logAction(shop, "settings.updated", "success", {
    targetType: "generalSettings",
    metadata: { updatedFields: Object.keys(data) },
  });

  return json({ success: true, errors: null });
};

export default function GeneralSettings() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  const isSaving = navigation.state === "submitting";
  const [darkMode, setDarkMode] = useState(settings?.darkMode ?? false);

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show("General settings saved");
    }
  }, [actionData, shopify]);

  return (
    <Box padding="600">
      <Form method="post">
        <BlockStack gap="600">
          {actionData?.errors?.form && (
            <Banner title="Save failed" tone="critical">
              <Text as="p">{actionData.errors.form}</Text>
            </Banner>
          )}

          {/* Widget Appearance */}
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Widget Appearance
            </Text>
            <Divider />
            <FormLayout>
              <FormLayout.Group>
                <Select
                  label="Widget Type"
                  name="widgetType"
                  options={WIDGET_OPTIONS}
                  defaultValue={settings?.widgetType ?? "popup"}
                  error={actionData?.errors?.widgetType}
                />
                <Select
                  label="Popup Position"
                  name="popupPosition"
                  options={POSITION_OPTIONS}
                  defaultValue={settings?.popupPosition ?? "center"}
                  error={actionData?.errors?.popupPosition}
                />
              </FormLayout.Group>
              <TextField
                label="Button Text"
                name="buttonText"
                defaultValue={settings?.buttonText ?? "Login with OTP"}
                maxLength={50}
                showCharacterCount
                autoComplete="off"
                error={actionData?.errors?.buttonText}
              />
            </FormLayout>
          </BlockStack>

          {/* Branding */}
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Branding
            </Text>
            <Divider />
            <FormLayout>
              <FormLayout.Group>
                <TextField
                  label="Brand Color"
                  name="brandColor"
                  placeholder="#3B82F6"
                  defaultValue={settings?.brandColor ?? ""}
                  autoComplete="off"
                  helpText="Hex color for buttons and accents (e.g. #FF5500)"
                  error={actionData?.errors?.brandColor}
                />
                <TextField
                  label="Logo URL"
                  name="logoUrl"
                  placeholder="https://cdn.example.com/logo.png"
                  defaultValue={settings?.logoUrl ?? ""}
                  autoComplete="off"
                  error={actionData?.errors?.logoUrl}
                />
              </FormLayout.Group>
              <Checkbox
                label="Enable Dark Mode"
                name="darkMode"
                value="true"
                checked={darkMode}
                onChange={setDarkMode}
              />
            </FormLayout>
          </BlockStack>

          {/* Localization */}
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Localization
            </Text>
            <Divider />
            <FormLayout>
              <Select
                label="Default Language"
                name="language"
                options={LANGUAGE_OPTIONS}
                defaultValue={settings?.language ?? "en"}
                error={actionData?.errors?.language}
              />
            </FormLayout>
          </BlockStack>

          {/* Advanced */}
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Advanced
            </Text>
            <Divider />
            <FormLayout>
              <TextField
                label="Custom CSS"
                name="customCss"
                multiline={6}
                defaultValue={settings?.customCss ?? ""}
                placeholder="/* Add custom styles here */"
                autoComplete="off"
                helpText="Applied to the OTP widget only"
                error={actionData?.errors?.customCss}
              />
              <TextField
                label="Custom JavaScript"
                name="customJs"
                multiline={4}
                defaultValue={settings?.customJs ?? ""}
                placeholder="// Custom JS runs after widget loads"
                autoComplete="off"
                helpText="Use with caution — runs in the customer's browser"
                error={actionData?.errors?.customJs}
              />
            </FormLayout>
          </BlockStack>

          <InlineStack align="end">
            <Button submit variant="primary" loading={isSaving}>
              Save General Settings
            </Button>
          </InlineStack>
        </BlockStack>
      </Form>
    </Box>
  );
}
