import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  FormLayout,
  InlineStack,
  Select,
  Text,
  TextField,
  Toast,
  Frame,
  Banner,
  InlineGrid,
} from "@shopify/polaris";
import { useState } from "react";
import { requireAdminAuth } from "~/middleware/auth.middleware";
import { settingsService } from "~/services/settings.service";
import { auditLogService } from "~/services/audit-log.service";
import { parseFormData } from "~/validators/common.validator";
import { otpSettingsSchema } from "~/validators/settings.validator";

const OTP_LENGTH_OPTIONS = [
  { label: "4 digits", value: "4" },
  { label: "5 digits", value: "5" },
  { label: "6 digits (recommended)", value: "6" },
  { label: "8 digits", value: "8" },
];

const OTP_EXPIRY_OPTIONS = [
  { label: "30 seconds", value: "30" },
  { label: "1 minute", value: "60" },
  { label: "2 minutes (recommended)", value: "120" },
  { label: "5 minutes", value: "300" },
  { label: "10 minutes", value: "600" },
];

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop, shopData } = await requireAdminAuth(args);
  return json({ shop, settings: shopData?.settings ?? null });
};

export const action = async (args: ActionFunctionArgs) => {
  const { shop } = await requireAdminAuth(args);
  const formData = await args.request.formData();

  const { data, errors } = parseFormData(otpSettingsSchema, formData);

  if (errors) {
    return json({ success: false, errors }, { status: 400 });
  }

  const result = await settingsService.updateOtpSettings(shop, {
    otpLength: data.otpLength as 4 | 5 | 6 | 8,
    otpExpiry: data.otpExpiry as 30 | 60 | 120 | 300 | 600,
    maxAttempts: data.maxAttempts,
    resendDelay: data.resendDelay,
    enableSmsOtp: data.enableSmsOtp,
    enableEmailOtp: data.enableEmailOtp,
    smsTemplate: data.smsTemplate,
  });

  if (!result.success) {
    return json({ success: false, errors: { form: result.error } }, { status: 500 });
  }

  await auditLogService.logAction(shop, "settings.updated", "success", {
    targetType: "otpSettings",
    metadata: { updatedFields: Object.keys(data) },
  });

  return json({ success: true, errors: null });
};

export default function OtpSettings() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const isSaving = navigation.state === "submitting";
  const [toastActive, setToastActive] = useState(false);

  if (actionData?.success && !toastActive) {
    setToastActive(true);
  }

  return (
    <Frame>
      {toastActive && (
        <Toast
          content="OTP settings saved"
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

            {/* OTP Code Settings */}
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                OTP Code Settings
              </Text>
              <Divider />
              <FormLayout>
                <FormLayout.Group>
                  <Select
                    label="OTP Length"
                    name="otpLength"
                    options={OTP_LENGTH_OPTIONS}
                    defaultValue={String(settings?.otpLength ?? 6)}
                    helpText="Longer codes are more secure"
                    error={actionData?.errors?.otpLength}
                  />
                  <Select
                    label="OTP Expiry"
                    name="otpExpiry"
                    options={OTP_EXPIRY_OPTIONS}
                    defaultValue={String(settings?.otpExpiry ?? 120)}
                    helpText="Time before OTP becomes invalid"
                    error={actionData?.errors?.otpExpiry}
                  />
                </FormLayout.Group>
              </FormLayout>
            </BlockStack>

            {/* Attempt & Resend Settings */}
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Attempts & Resend
              </Text>
              <Divider />
              <FormLayout>
                <FormLayout.Group>
                  <TextField
                    label="Max Verification Attempts"
                    name="maxAttempts"
                    type="number"
                    min="1"
                    max="10"
                    defaultValue={String(settings?.maxAttempts ?? 5)}
                    helpText="1–10. Customer is blocked after this many failed attempts."
                    autoComplete="off"
                    error={actionData?.errors?.maxAttempts}
                  />
                  <TextField
                    label="Resend Delay (seconds)"
                    name="resendDelay"
                    type="number"
                    min="10"
                    max="300"
                    defaultValue={String(settings?.resendDelay ?? 30)}
                    helpText="10–300 seconds before customer can request a new OTP"
                    autoComplete="off"
                    error={actionData?.errors?.resendDelay}
                  />
                </FormLayout.Group>
              </FormLayout>
            </BlockStack>

            {/* OTP Channels */}
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Channels
              </Text>
              <Divider />
              <BlockStack gap="300">
                <Checkbox
                  label="Enable SMS OTP"
                  name="enableSmsOtp"
                  value="true"
                  checked={settings?.enableSmsOtp ?? true}
                  helpText="Send OTP via SMS. Requires an SMS provider configured."
                />
                <Checkbox
                  label="Enable Email OTP"
                  name="enableEmailOtp"
                  value="true"
                  checked={settings?.enableEmailOtp ?? false}
                  helpText="Growth plan and above. Send OTP to customer's email address."
                />
              </BlockStack>
            </BlockStack>

            {/* SMS Message Template */}
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                SMS Message Template
              </Text>
              <Divider />
              <TextField
                label="OTP Message"
                name="smsTemplate"
                multiline={3}
                defaultValue={
                  settings?.smsTemplate ??
                  "Your OTP is {{otp}}. Valid for 5 minutes. Do not share."
                }
                helpText="Use {{otp}} where the code should appear. Keep under 160 characters for a single SMS."
                autoComplete="off"
                showCharacterCount
                maxLength={320}
                error={actionData?.errors?.smsTemplate}
              />
              <Text as="p" variant="bodySm" tone="subdued">
                Example for DS Group:{" "}
                <em>
                  Dear User, Your OTP for logging to Rclub is {"{{otp}}"}. The OTP will
                  remain valid for 5 minutes. Thank you, DS Group.
                </em>
              </Text>
            </BlockStack>

            <InlineStack align="end">
              <Button submit variant="primary" loading={isSaving}>
                Save OTP Settings
              </Button>
            </InlineStack>
          </BlockStack>
        </Form>
      </Box>
    </Frame>
  );
}
