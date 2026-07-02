/**
 * SMS template variable renderer.
 *
 * Templates use {{variableName}} placeholders. Unknown variables are left as-is
 * so missing substitutions are visible in logs rather than silently removed.
 *
 * Standard variables:
 *   {{otp}}       — the OTP code
 *   {{store}}     — shop display name
 *   {{expiry}}    — expiry in human-readable form ("2 minutes")
 *   {{phone}}     — masked phone number
 *   {{appName}}   — application name (from APP_NAME env)
 */

const MAX_SMS_LENGTH = 612; // 4 × 153-char GSM-7 segments

/**
 * Replaces all {{variable}} placeholders in the template string with the
 * corresponding value from the variables map. Extra whitespace is collapsed.
 *
 * @throws never — returns a best-effort string on all inputs.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  if (!template) return "";

  const rendered = template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const trimmed = key.trim();
    return Object.prototype.hasOwnProperty.call(variables, trimmed)
      ? variables[trimmed]
      : `{{${trimmed}}}`;
  });

  // Collapse multiple spaces / normalize line endings
  return rendered.replace(/\s+/g, " ").trim();
}

/**
 * Returns the default OTP SMS template for a given expiry duration.
 */
export function defaultOtpTemplate(expirySeconds: number): string {
  const expiryText = formatExpiry(expirySeconds);
  return `Your OTP code is {{otp}}. It is valid for ${expiryText}. Do not share it with anyone.`;
}

/**
 * Estimates the number of SMS segments required for a message.
 * GSM-7 charset: 160 chars per segment. Unicode: 70 chars per segment.
 * Multi-segment GSM-7: 153 chars per segment. Multi-segment Unicode: 67 chars per segment.
 */
export function estimateSmsSegments(message: string): number {
  // Detect if non-GSM7 characters are present (simplified check)
  const isGsm7 = /^[\x20-\x7E\n\r\t£¥€çéùìòÇøØÅåÆæßÉ !"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]+$/.test(
    message
  );

  if (isGsm7) {
    if (message.length <= 160) return 1;
    return Math.ceil(message.length / 153);
  } else {
    if (message.length <= 70) return 1;
    return Math.ceil(message.length / 67);
  }
}

/**
 * Validates that a template renders within the SMS length limit.
 */
export function validateTemplate(
  template: string,
  sampleVariables: Record<string, string>
): { valid: boolean; segments: number; length: number } {
  const rendered = renderTemplate(template, sampleVariables);
  const segments = estimateSmsSegments(rendered);
  return {
    valid: rendered.length <= MAX_SMS_LENGTH,
    segments,
    length: rendered.length,
  };
}

function formatExpiry(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const mins = Math.floor(seconds / 60);
  return mins === 1 ? "1 minute" : `${mins} minutes`;
}
