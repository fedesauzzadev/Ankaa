export interface Spec {
  inputHash: string;
  openapiVersion: string;
  sourceLabel: string;
  info: {
    title?: string;
    version?: string;
    description?: string;
  };
  operations: Operation[];
  components: ComponentIndex;
  parseWarnings: ParseWarning[];
}

export interface Operation {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags: string[];
  deprecated: boolean;
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Response[];
  security: SecurityRequirement[] | undefined;
  extensions: Record<string, unknown>;
  jsonPointer: string;
}

export interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  deprecated?: boolean;
  description?: string;
  schema?: SchemaNode;
  jsonPointer: string;
}

export interface RequestBody {
  required: boolean;
  description?: string;
  content: ContentMedia[];
  jsonPointer: string;
}

export interface ContentMedia {
  mediaType: string;
  schema?: SchemaNode;
}

export interface Response {
  status: string;
  description?: string;
  content: ContentMedia[];
  headers: string[];
  jsonPointer: string;
}

export interface SchemaNode {
  type?: string | string[];
  format?: string;
  ref?: string;
  enum?: unknown[];
  properties?: Record<string, SchemaNode>;
  required?: string[];
  maxLength?: number;
  example?: unknown;
}

export interface ComponentIndex {
  schemas: string[];
  responses: string[];
  parameters: string[];
}

export interface SecurityRequirement {
  name: string;
  scopes: string[];
}

export interface ParseWarning {
  code: string;
  message: string;
  jsonPointer?: string;
}
