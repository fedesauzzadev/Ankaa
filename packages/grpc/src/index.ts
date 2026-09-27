export {
  parseProto,
  DEFAULT_LIMITS,
  type ParseLimits,
  type ParseError,
  type ParseResult,
  type ParseOptions,
} from "./parse.js";

export const GRPC_PACKAGE = "@apigovscan/grpc";

export function grpcPackageId(): string {
  return GRPC_PACKAGE;
}
