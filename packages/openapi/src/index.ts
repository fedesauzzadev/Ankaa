export {
  parseSpec,
  validateRefs,
  DEFAULT_LIMITS,
  type ParseLimits,
  type ParseError,
  type ParseResult,
  type ParseOptions,
} from "./parse.js";

export const OPENAPI_PACKAGE = "@apigovscan/openapi";

export function openapiPackageId(): string {
  return OPENAPI_PACKAGE;
}
