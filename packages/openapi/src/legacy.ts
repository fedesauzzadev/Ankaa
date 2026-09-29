type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSwagger2Doc(doc: unknown): boolean {
  return (
    isRecord(doc) &&
    typeof doc["swagger"] === "string" &&
    (doc["swagger"] as string).startsWith("2.")
  );
}

export function isSwagger1Doc(doc: unknown): boolean {
  if (!isRecord(doc)) return false;
  const v = doc["swaggerVersion"];
  if (typeof v !== "string" || !v.startsWith("1.")) return false;
  if (doc["openapi"] !== undefined || doc["swagger"] !== undefined) return false;
  return Array.isArray(doc["apis"]);
}

export interface LegacyConversion {
  doc: Json;
  dropped: string[];
  origin: string;
}

function rewriteRefString(ref: string): string {
  if (ref.startsWith("#/definitions/")) {
    return `#/components/schemas/${ref.slice("#/definitions/".length)}`;
  }
  return ref;
}

function deepRewriteRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepRewriteRefs);
  if (!isRecord(value)) return value;
  const out: Json = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string") {
      out[key] = rewriteRefString(child);
    } else {
      out[key] = deepRewriteRefs(child) as unknown;
    }
  }
  return out;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function swagger2ParamToSchema(param: Json, dropped: string[]): Json | undefined {
  if (param["schema"] !== undefined && isRecord(param["schema"])) {
    return deepRewriteRefs(param["schema"]) as Json;
  }
  const schema: Json = {};
  let present = false;
  for (const key of [
    "type",
    "format",
    "items",
    "enum",
    "default",
    "maximum",
    "minimum",
    "maxLength",
  ]) {
    if (param[key] !== undefined) {
      schema[key] = deepRewriteRefs(param[key]) as unknown;
      present = true;
    }
  }
  if (param["collectionFormat"] !== undefined && param["collectionFormat"] !== "csv") {
    dropped.push(`collectionFormat:${String(param["collectionFormat"])}`);
  }
  return present ? schema : undefined;
}

export function convertSwagger2(doc: Json): LegacyConversion {
  const dropped: string[] = [];
  const out: Json = { openapi: "3.0.0" };

  const infoRaw = isRecord(doc["info"]) ? (doc["info"] as Json) : {};
  out["info"] = {
    ...(asString(infoRaw["title"]) !== undefined
      ? { title: infoRaw["title"] }
      : { title: "Legacy Swagger 2.0" }),
    ...(asString(infoRaw["version"]) !== undefined
      ? { version: infoRaw["version"] }
      : { version: "1.0.0" }),
    ...(asString(infoRaw["description"]) !== undefined
      ? { description: infoRaw["description"] }
      : {}),
  };

  const host = asString(doc["host"]);
  const basePath = asString(doc["basePath"]) ?? "";
  const schemes = Array.isArray(doc["schemes"])
    ? (doc["schemes"] as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  if (host !== undefined) {
    const scheme = schemes[0] ?? "https";
    out["servers"] = [{ url: `${scheme}://${host}${basePath}` }];
  } else if (basePath.length > 0) {
    out["servers"] = [{ url: basePath }];
  }

  if (Array.isArray(doc["tags"])) out["tags"] = doc["tags"];
  if (isRecord(doc["externalDocs"])) out["externalDocs"] = doc["externalDocs"];

  const pathsRaw = isRecord(doc["paths"]) ? (doc["paths"] as Json) : {};
  const paths: Json = {};
  for (const [path, pathItemRaw] of Object.entries(pathsRaw)) {
    if (!isRecord(pathItemRaw)) continue;
    const pathItem: Json = {};
    if (pathItemRaw["parameters"] !== undefined) {
      pathItem["parameters"] = pathItemRaw["parameters"];
    }
    for (const [method, opRaw] of Object.entries(pathItemRaw)) {
      if (method === "parameters" || method === "$ref") continue;
      if (!isRecord(opRaw)) continue;
      const op: Json = {};
      for (const key of ["operationId", "summary", "description", "tags", "externalDocs"]) {
        if (opRaw[key] !== undefined) op[key] = opRaw[key];
      }
      if (opRaw["deprecated"] === true) op["deprecated"] = true;
      if (opRaw["security"] !== undefined) op["security"] = opRaw["security"];

      const params = Array.isArray(opRaw["parameters"]) ? (opRaw["parameters"] as unknown[]) : [];
      const convertedParams: Json[] = [];
      let bodyParam: Json | undefined;
      for (const p of params) {
        if (!isRecord(p)) continue;
        if (typeof p["$ref"] === "string") {
          convertedParams.push(deepRewriteRefs(p) as Json);
          continue;
        }
        const loc = asString(p["in"]);
        if (loc === "body") {
          bodyParam = p;
          continue;
        }
        if (loc === "formData") {
          dropped.push(`formData:${asString(p["name"]) ?? "param"}`);
          continue;
        }
        const schema = swagger2ParamToSchema(p, dropped);
        const converted: Json = {
          name: p["name"],
          in: loc,
          ...(p["required"] === true ? { required: true } : { required: false }),
          ...(asString(p["description"]) !== undefined ? { description: p["description"] } : {}),
          ...(schema !== undefined ? { schema } : {}),
        };
        convertedParams.push(converted);
      }
      if (convertedParams.length > 0) op["parameters"] = convertedParams;
      if (bodyParam !== undefined) {
        const schema = isRecord(bodyParam["schema"])
          ? (deepRewriteRefs(bodyParam["schema"]) as Json)
          : { type: "object" };
        op["requestBody"] = {
          ...(bodyParam["required"] === true ? { required: true } : {}),
          content: { "application/json": { schema } },
        };
      }
      if (bodyParam !== undefined && bodyParam["collectionFormat"] !== undefined) {
        dropped.push("collectionFormat:body");
      }

      const responsesRaw = isRecord(opRaw["responses"]) ? (opRaw["responses"] as Json) : {};
      const responses: Json = {};
      for (const [status, rRaw] of Object.entries(responsesRaw)) {
        if (!isRecord(rRaw)) continue;
        const r: Json = {
          description: asString(rRaw["description"]) ?? "",
        };
        const schema =
          rRaw["schema"] !== undefined ? (deepRewriteRefs(rRaw["schema"]) as Json) : undefined;
        if (schema !== undefined) {
          r["content"] = { "application/json": { schema } };
        }
        if (isRecord(rRaw["headers"])) {
          r["headers"] = rRaw["headers"];
        }
        responses[status] = r;
      }
      op["responses"] = responses;
      pathItem[method] = op;
    }
    paths[path] = pathItem;
  }
  out["paths"] = paths;

  const components: Json = {};
  if (isRecord(doc["definitions"])) {
    components["schemas"] = deepRewriteRefs(doc["definitions"]) as Json;
  }
  if (isRecord(doc["securityDefinitions"])) {
    const schemesOut: Json = {};
    for (const [name, sRaw] of Object.entries(doc["securityDefinitions"] as Json)) {
      if (!isRecord(sRaw)) continue;
      const type = asString(sRaw["type"]);
      if (type === "basic") {
        schemesOut[name] = { type: "http", scheme: "basic" };
      } else if (type === "apiKey") {
        schemesOut[name] = {
          type: "apiKey",
          in: sRaw["in"],
          name: sRaw["name"],
        };
      } else if (type === "oauth2") {
        schemesOut[name] = { type: "oauth2" };
        if (sRaw["scopes"] === undefined) dropped.push(`oauth2-scopes:${name}`);
      } else {
        dropped.push(`securityDefinition:${name}`);
      }
    }
    if (Object.keys(schemesOut).length > 0) components["securitySchemes"] = schemesOut;
  }
  if (Object.keys(components).length > 0) out["components"] = components;
  if (doc["security"] !== undefined) out["security"] = doc["security"];

  return { doc: out, dropped, origin: "swagger-2.0" };
}

function swagger1TypeToSchema(
  param: Json,
  models: Set<string>,
  dropped: string[],
): Json | undefined {
  const ref = asString(param["$ref"]);
  if (ref !== undefined) {
    return { $ref: `#/components/schemas/${ref}` };
  }
  const type = asString(param["type"]);
  if (type === undefined) return undefined;
  if (models.has(type)) {
    return { $ref: `#/components/schemas/${type}` };
  }
  const schema: Json = { type: type === "int" ? "integer" : type };
  if (asString(param["format"]) !== undefined) schema["format"] = param["format"];
  if (param["allowableValues"] !== undefined) {
    dropped.push("allowableValues");
  }
  return schema;
}

export function convertSwagger1(doc: Json): LegacyConversion {
  const dropped: string[] = [];
  const out: Json = { openapi: "3.0.0" };

  const infoRaw = isRecord(doc["info"]) ? (doc["info"] as Json) : {};
  const apiVersion = asString(doc["apiVersion"]) ?? "1.0.0";
  out["info"] = {
    title: asString(infoRaw["title"]) ?? "Legacy Swagger 1.x",
    version: asString(infoRaw["version"]) ?? apiVersion,
    ...(asString(infoRaw["description"]) !== undefined
      ? { description: infoRaw["description"] }
      : {}),
  };

  const basePath = asString(doc["basePath"]);
  if (basePath !== undefined) out["servers"] = [{ url: basePath }];

  const modelsRaw = isRecord(doc["models"]) ? (doc["models"] as Json) : {};
  const modelNames = new Set(Object.keys(modelsRaw));

  const apis = Array.isArray(doc["apis"]) ? (doc["apis"] as unknown[]) : [];
  const paths: Json = {};
  for (const api of apis) {
    if (!isRecord(api)) continue;
    const apiPath = asString(api["path"]) ?? "/";
    const operations = Array.isArray(api["operations"]) ? (api["operations"] as unknown[]) : [];
    const pathItem: Json = {};
    for (const opRaw of operations) {
      if (!isRecord(opRaw)) continue;
      const method = asString(opRaw["method"])?.toLowerCase() ?? "get";
      const op: Json = {};
      const nickname = asString(opRaw["nickname"]);
      if (nickname !== undefined) op["operationId"] = nickname;
      if (asString(opRaw["summary"]) !== undefined) op["summary"] = opRaw["summary"];
      if (asString(opRaw["notes"]) !== undefined) op["description"] = opRaw["notes"];
      const deprecated = opRaw["deprecated"];
      if (deprecated === true || deprecated === "true") op["deprecated"] = true;
      if (opRaw["authorizations"] !== undefined) {
        dropped.push("authorizations");
      }

      const params = Array.isArray(opRaw["parameters"]) ? (opRaw["parameters"] as unknown[]) : [];
      const convertedParams: Json[] = [];
      let bodySchema: Json | undefined;
      let bodyRequired = false;
      for (const p of params) {
        if (!isRecord(p)) continue;
        const paramType = asString(p["paramType"]) ?? asString(p["in"]) ?? "query";
        if (paramType === "body") {
          bodySchema = swagger1TypeToSchema(p, modelNames, dropped) ?? { type: "object" };
          if (p["required"] === true) bodyRequired = true;
          continue;
        }
        if (paramType === "form") {
          dropped.push(`form:${asString(p["name"]) ?? "param"}`);
          continue;
        }
        const schema = swagger1TypeToSchema(p, modelNames, dropped);
        convertedParams.push({
          name: asString(p["name"]) ?? "param",
          in: paramType,
          required: p["required"] === true,
          ...(asString(p["description"]) !== undefined ? { description: p["description"] } : {}),
          ...(schema !== undefined ? { schema } : {}),
        });
      }
      if (convertedParams.length > 0) op["parameters"] = convertedParams;
      if (bodySchema !== undefined) {
        op["requestBody"] = {
          ...(bodyRequired ? { required: true } : {}),
          content: { "application/json": { schema: bodySchema } },
        };
      }

      const messages = Array.isArray(opRaw["responseMessages"])
        ? (opRaw["responseMessages"] as unknown[])
        : [];
      const responses: Json = {};
      if (messages.length === 0) {
        responses["default"] = { description: "" };
      } else {
        for (const m of messages) {
          if (!isRecord(m)) continue;
          const code = m["code"] !== undefined ? String(m["code"]) : "default";
          const r: Json = { description: asString(m["message"]) ?? "" };
          const model = asString(m["responseModel"]);
          if (model !== undefined) {
            r["content"] = {
              "application/json": { schema: { $ref: `#/components/schemas/${model}` } },
            };
          }
          responses[code] = r;
        }
      }
      op["responses"] = responses;
      pathItem[method] = op;
    }
    const existing = paths[apiPath];
    if (isRecord(existing)) {
      paths[apiPath] = { ...existing, ...pathItem };
    } else {
      paths[apiPath] = pathItem;
    }
  }
  out["paths"] = paths;

  if (Object.keys(modelsRaw).length > 0) {
    const schemas: Json = {};
    for (const [name, mRaw] of Object.entries(modelsRaw)) {
      if (!isRecord(mRaw)) continue;
      const schema: Json = { type: "object" };
      if (isRecord(mRaw["properties"])) {
        const props: Json = {};
        for (const [propName, propRaw] of Object.entries(mRaw["properties"] as Json)) {
          if (!isRecord(propRaw)) continue;
          const ref = asString(propRaw["$ref"]);
          if (ref !== undefined) {
            props[propName] = { $ref: `#/components/schemas/${ref}` };
            continue;
          }
          const type = asString(propRaw["type"]) ?? "string";
          if (modelNames.has(type)) {
            props[propName] = { $ref: `#/components/schemas/${type}` };
            continue;
          }
          const node: Json = { type };
          if (asString(propRaw["description"]) !== undefined) {
            node["description"] = propRaw["description"];
          }
          props[propName] = node;
        }
        schema["properties"] = props;
      }
      if (Array.isArray(mRaw["required"])) {
        schema["required"] = (mRaw["required"] as unknown[]).filter(
          (r): r is string => typeof r === "string",
        );
      }
      schemas[asString(mRaw["id"]) ?? name] = schema;
    }
    out["components"] = { schemas };
  }

  return { doc: out, dropped, origin: "swagger-1.x" };
}
