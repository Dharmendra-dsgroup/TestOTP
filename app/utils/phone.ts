// Phone number utilities — normalization, masking, validation
// Uses E.164 format for all stored/transmitted phone numbers

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

// Rough dial-code prefix map for basic country detection
const DIAL_CODES: Record<string, string> = {
  "+1": "US",
  "+7": "RU",
  "+20": "EG",
  "+27": "ZA",
  "+31": "NL",
  "+33": "FR",
  "+34": "ES",
  "+39": "IT",
  "+44": "GB",
  "+45": "DK",
  "+46": "SE",
  "+47": "NO",
  "+48": "PL",
  "+49": "DE",
  "+52": "MX",
  "+55": "BR",
  "+60": "MY",
  "+61": "AU",
  "+62": "ID",
  "+63": "PH",
  "+64": "NZ",
  "+65": "SG",
  "+66": "TH",
  "+81": "JP",
  "+82": "KR",
  "+84": "VN",
  "+86": "CN",
  "+90": "TR",
  "+91": "IN",
  "+92": "PK",
  "+966": "SA",
  "+971": "AE",
  "+972": "IL",
  "+880": "BD",
  "+234": "NG",
  "+233": "GH",
  "+254": "KE",
  "+351": "PT",
  "+358": "FI",
};

/**
 * Normalizes a phone number to E.164 format.
 *
 * Accepts:
 * - E.164: "+919876543210"
 * - With spaces/dashes: "+1 (555) 867-5309"
 * - With dots: "+44.20.7946.0958"
 *
 * Returns null if the result is not a valid E.164 number.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;

  // Strip all whitespace, parentheses, dashes, dots
  const cleaned = raw.replace(/[\s\-().]/g, "");

  // Must start with + for E.164
  if (!cleaned.startsWith("+")) return null;

  // Keep only + and digits
  const e164 = "+" + cleaned.slice(1).replace(/\D/g, "");

  return E164_REGEX.test(e164) ? e164 : null;
}

/**
 * Returns true if the string is a valid E.164 phone number.
 */
export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone);
}

/**
 * Masks a phone number for display.
 * "+919876543210" → "+91****3210"
 * "+15558675309"  → "+1****5309"
 */
export function maskPhone(phone: string): string {
  if (!phone.startsWith("+")) return "****";

  // Find dial code length (1–3 digits after +)
  let dialLen = 1;
  for (const prefix of ["+1", "+7"]) {
    if (phone.startsWith(prefix)) { dialLen = prefix.length - 1; break; }
  }
  for (const code of Object.keys(DIAL_CODES)) {
    if (phone.startsWith(code) && code.length > dialLen + 1) {
      dialLen = code.length - 1;
    }
  }

  const dialCode = phone.slice(0, dialLen + 1); // e.g. "+91"
  const rest = phone.slice(dialLen + 1);

  if (rest.length <= 4) return `${dialCode}****`;

  const last4 = rest.slice(-4);
  return `${dialCode}****${last4}`;
}

/**
 * Masks an email address for display.
 * "user@example.com" → "us**@example.com"
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return "****";

  const local = email.slice(0, at);
  const domain = email.slice(at);

  if (local.length <= 2) return `${local[0] ?? "*"}*${domain}`;

  return `${local.slice(0, 2)}${"*".repeat(Math.min(local.length - 2, 3))}${domain}`;
}

/**
 * Attempts to detect a 2-letter country code from an E.164 number.
 * Returns null if unknown.
 */
export function countryFromPhone(e164: string): string | null {
  // Try longest prefix first
  for (const [code, country] of Object.entries(DIAL_CODES).sort(
    (a, b) => b[0].length - a[0].length
  )) {
    if (e164.startsWith(code)) return country;
  }
  return null;
}
