/**
 * SMS Provider Factory
 *
 * Constructs a concrete ISmsProvider instance from a provider type string and
 * decrypted credentials. The factory is the single place that knows about all
 * concrete provider implementations, keeping the rest of the codebase
 * decoupled from specific providers.
 */

import type { ISmsProvider } from "./interfaces/sms-provider.interface";
import type { SmsProviderType, SmsProviderCredentials } from "~/types/sms.types";
import { DefaultProvider } from "./providers/default.provider";
import { TwilioProvider } from "./providers/twilio.provider";
import { Msg91Provider } from "./providers/msg91.provider";
import { TextLocalProvider } from "./providers/textlocal.provider";
import { GenericRestProvider } from "./providers/generic-rest.provider";

/**
 * Creates an ISmsProvider instance for the given type with decrypted credentials.
 *
 * @throws Error if the provider type is unsupported.
 */
export function createProvider(
  type: SmsProviderType,
  credentials: SmsProviderCredentials,
  displayName?: string
): ISmsProvider {
  switch (type) {
    case "default":
      return new DefaultProvider();

    case "twilio":
      return new TwilioProvider(credentials);

    case "msg91":
      return new Msg91Provider(credentials);

    case "textlocal":
      return new TextLocalProvider(credentials);

    case "generic_rest":
      return new GenericRestProvider(credentials, displayName);

    // Future providers — fall through to GenericRestProvider with preset endpoint
    case "aws_sns":
    case "vonage":
    case "exotel":
    case "plivo":
    case "kaleyra":
    case "fast2sms":
    case "gupshup":
    case "infobip":
    case "clickatell":
      // These are wired as GenericRestProvider stubs until native implementations
      // are added. The merchant must configure endpoint/bodyTemplate manually.
      return new GenericRestProvider(credentials, displayName ?? type);

    default: {
      // Exhaustiveness check — TypeScript will flag unhandled cases
      const _exhaustive: never = type;
      throw new Error(`Unsupported SMS provider type: ${String(_exhaustive)}`);
    }
  }
}
