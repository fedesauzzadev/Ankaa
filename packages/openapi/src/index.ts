export {
  parseSpec,
  validateRefs,
  DEFAULT_LIMITS,
  type ParseLimits,
  type ParseError,
  type ParseResult,
  type ParseOptions,
} from "./parse.js";
export { convertSwagger1, convertSwagger2, isSwagger1Doc, isSwagger2Doc } from "./legacy.js";

export const OPENAPI_PACKAGE = "@apigovscan/openapi";

export function openapiPackageId(): string {
  return OPENAPI_PACKAGE;
}
