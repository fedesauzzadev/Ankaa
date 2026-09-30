export {
  parseWebhooks,
  looksLikeWebhooks,
  DEFAULT_LIMITS,
  type ParseLimits,
  type ParseError,
  type ParseResult,
  type ParseOptions,
} from "./parse.js";

export const WEBHOOKS_PACKAGE = "@ankaa/webhooks";

export function webhooksPackageId(): string {
  return WEBHOOKS_PACKAGE;
}
