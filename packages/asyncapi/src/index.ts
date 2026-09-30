export {
  parseAsyncAPI,
  looksLikeAsyncApi,
  DEFAULT_LIMITS,
  type ParseLimits,
  type ParseError,
  type ParseResult,
  type ParseOptions,
} from "./parse.js";

export const ASYNCAPI_PACKAGE = "@ankaa/asyncapi";

export function asyncapiPackageId(): string {
  return ASYNCAPI_PACKAGE;
}
