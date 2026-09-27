export {
  parseGraphQL,
  DEFAULT_LIMITS,
  type ParseLimits,
  type ParseError,
  type ParseResult,
  type ParseOptions,
} from "./parse.js";

export const GRAPHQL_PACKAGE = "@apigovscan/graphql";

export function graphqlPackageId(): string {
  return GRAPHQL_PACKAGE;
}
