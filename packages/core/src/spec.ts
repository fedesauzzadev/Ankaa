export interface Spec {
  inputHash: string;
  openapiVersion: string;
  sourceLabel: string;
  info: {
    title?: string;
    version?: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  extensions?: Record<string, unknown>;
  rootTags?: string[];
  security?: SecurityRequirement[];
  inputBytes?: number;
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
  externalDocs?: { url?: string; description?: string };
  jsonPointer: string;
}

export interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  deprecated?: boolean;
  description?: string;
  style?: string;
  explode?: boolean;
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
  description?: string;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  maxLength?: number;
  maximum?: number;
  additionalProperties?: boolean;
  items?: SchemaNode;
  example?: unknown;
}

export interface SecuritySchemeDef {
  name: string;
  type: string;
  scheme?: string;
  in?: string;
  paramName?: string;
}

export interface ComponentIndex {
  schemas: string[];
  responses: string[];
  parameters: string[];
  securitySchemes: string[];
  schemaNodes?: Record<string, SchemaNode>;
  securitySchemeDefs?: SecuritySchemeDef[];
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
