// Vendored resolved copy of the Spectral `oas` ruleset for offline
// `extends: [spectral:oas]` (spec f8-spectral-import section 4).
// Source: @stoplight/spectral-rulesets 1.23.0 (ruleset oas = oas3 + oas2 resolved).
// License: Apache-2.0, Copyright 2019 Stoplight, Inc. Same license as Ankaa.
// Functions are serialized by name; null = selection-only rule.
// Generated 2026-10-01 by a deterministic dump script; do not edit by hand.
export const VENDOR_OAS = {
  "_ankaaVendor": {
    "source": "@stoplight/spectral-rulesets",
    "version": "1.23.0",
    "ruleset": "oas (resolved: oas3 + oas2)",
    "license": "Apache-2.0",
    "copyright": "Copyright 2019 Stoplight, Inc.",
    "note": "Vendored resolved copy for offline `extends: [spectral:oas]` in ankaa migrate --spectral (spec f8-spectral-import §4). Functions serialized by name; null = selection-only rule.",
    "serializedAt": "2026-10-01"
  },
  "rules": {
    "array-items": {
      "severity": 0,
      "recommended": true,
      "given": "#ArrayProperties",
      "then": [
        {
          "field": "items",
          "function": "truthy"
        }
      ]
    },
    "contact-properties": {
      "description": "Contact object must have \"name\", \"url\" and \"email\".",
      "recommended": false,
      "given": "$.info.contact",
      "then": [
        {
          "field": "name",
          "function": "truthy"
        },
        {
          "field": "url",
          "function": "truthy"
        },
        {
          "field": "email",
          "function": "truthy"
        }
      ]
    },
    "duplicated-entry-in-enum": {
      "description": "Enum values must not have duplicate entry.",
      "severity": "warn",
      "recommended": true,
      "given": [
        "$..[?(@property !== 'properties' && @ != null && @.enum && @.enum.constructor.name === 'Array')]"
      ],
      "then": [
        {
          "field": "enum",
          "function": "oasSchema",
          "functionOptions": {
            "schema": {
              "type": "array",
              "uniqueItems": true
            }
          }
        }
      ]
    },
    "info-contact": {
      "description": "Info object must have \"contact\" object.",
      "recommended": true,
      "given": "$",
      "then": [
        {
          "field": "info.contact",
          "function": "truthy"
        }
      ]
    },
    "info-description": {
      "description": "Info \"description\" must be present and non-empty string.",
      "recommended": true,
      "given": "$",
      "then": [
        {
          "field": "info.description",
          "function": "truthy"
        }
      ]
    },
    "info-license": {
      "description": "Info object must have \"license\" object.",
      "recommended": false,
      "given": "$",
      "then": [
        {
          "field": "info.license",
          "function": "truthy"
        }
      ]
    },
    "license-url": {
      "description": "License object must include \"url\".",
      "recommended": false,
      "given": "$",
      "then": [
        {
          "field": "info.license.url",
          "function": "truthy"
        }
      ]
    },
    "no-$ref-siblings": {
      "description": "Property must not be placed among $ref",
      "severity": 0,
      "recommended": true,
      "given": "$..[?(@property === '$ref')]",
      "then": [
        {
          "function": "refSiblings"
        }
      ],
      "formats": [
        "oas2",
        "oas3_0"
      ]
    },
    "no-eval-in-markdown": {
      "description": "Markdown descriptions must not have \"eval(\".",
      "recommended": true,
      "given": "$..[description,title]",
      "then": [
        {
          "function": "pattern",
          "functionOptions": {
            "notMatch": "eval\\("
          }
        }
      ]
    },
    "no-script-tags-in-markdown": {
      "description": "Markdown descriptions must not have \"<script>\" tags.",
      "recommended": true,
      "given": "$..[description,title]",
      "then": [
        {
          "function": "pattern",
          "functionOptions": {
            "notMatch": "<script"
          }
        }
      ]
    },
    "oas2-anyOf": {
      "description": "anyOf is not available in OpenAPI v2, it was added in OpenAPI v3",
      "recommended": true,
      "given": "$..anyOf",
      "then": [
        {
          "function": "undefined"
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas2-api-host": {
      "description": "OpenAPI \"host\" must be present and non-empty string.",
      "recommended": true,
      "given": "$",
      "then": [
        {
          "field": "host",
          "function": "truthy"
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas2-api-schemes": {
      "description": "OpenAPI host \"schemes\" must be present and non-empty array.",
      "recommended": true,
      "given": "$",
      "then": [
        {
          "field": "schemes",
          "function": "schema",
          "functionOptions": {
            "dialect": "draft7",
            "schema": {
              "items": {
                "type": "string"
              },
              "minItems": 1,
              "type": "array"
            }
          }
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas2-discriminator": {
      "description": "discriminator property must be defined and required",
      "severity": 0,
      "recommended": true,
      "given": "$.definitions[?(@.discriminator)]",
      "then": [
        {
          "function": "oasDiscriminator"
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas2-host-not-example": {
      "description": "Host URL must not point at example.com.",
      "recommended": false,
      "given": "$",
      "then": [
        {
          "field": "host",
          "function": "pattern",
          "functionOptions": {
            "notMatch": "example\\.com"
          }
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas2-host-trailing-slash": {
      "description": "Server URL must not have trailing slash.",
      "recommended": true,
      "given": "$",
      "then": [
        {
          "field": "host",
          "function": "pattern",
          "functionOptions": {
            "notMatch": "/$"
          }
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas2-oneOf": {
      "description": "oneOf is not available in OpenAPI v2, it was added in OpenAPI v3",
      "recommended": true,
      "given": "$..oneOf",
      "then": [
        {
          "function": "undefined"
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas2-operation-formData-consume-check": {
      "description": "Operations with \"in: formData\" parameter must include \"application/x-www-form-urlencoded\" or \"multipart/form-data\" in their \"consumes\" property.",
      "recommended": true,
      "given": "#OperationObject",
      "then": [
        {
          "function": "oasOpFormDataConsumeCheck"
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas2-operation-security-defined": {
      "description": "Operation \"security\" values must match a scheme defined in the \"securityDefinitions\" object.",
      "recommended": true,
      "given": "#SecurityRequirementObject",
      "then": [
        {
          "function": "oasSecurityDefined",
          "functionOptions": {
            "oasVersion": 2
          }
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas2-parameter-description": {
      "description": "Parameter objects must have \"description\".",
      "recommended": false,
      "given": "$..parameters[?(@ && @.in)]",
      "then": [
        {
          "field": "description",
          "function": "truthy"
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas2-schema": {
      "description": "Validate structure of OpenAPI v2 specification.",
      "severity": 0,
      "recommended": true,
      "given": "$",
      "then": [
        {
          "function": "oasDocumentSchema"
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas2-unused-definition": {
      "description": "Potentially unused definition has been detected.",
      "recommended": true,
      "given": "$.definitions",
      "then": [
        {
          "function": "unreferencedReusableObject",
          "functionOptions": {
            "reusableObjectsLocation": "#/definitions"
          }
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas2-valid-media-example": {
      "description": "Examples must be valid against their defined schema.",
      "severity": 0,
      "recommended": true,
      "given": "$..responses..[?(@ && @.schema && @.examples)]",
      "then": [
        {
          "function": "oasExample",
          "functionOptions": {
            "schemaField": "schema",
            "oasVersion": 2,
            "type": "media"
          }
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas2-valid-schema-example": {
      "description": "Examples must be valid against their defined schema.",
      "severity": 0,
      "recommended": true,
      "given": [
        "$..definitions..[?(@property !== 'properties' && @ && (@.example !== void 0 || @['x-example'] !== void 0 || @.default !== void 0) && (@.enum || @.type || @.format || @.$ref || @.properties || @.items))]",
        "$..parameters..[?(@property !== 'properties' && @ && (@.example !== void 0 || @['x-example'] !== void 0 || @.default !== void 0) && (@.enum || @.type || @.format || @.$ref || @.properties || @.items))]",
        "$..responses..[?(@property !== 'properties' && @ && (@.example !== void 0 || @['x-example'] !== void 0 || @.default !== void 0) && (@.enum || @.type || @.format || @.$ref || @.properties || @.items))]"
      ],
      "then": [
        {
          "function": "oasExample",
          "functionOptions": {
            "schemaField": "$",
            "oasVersion": 2,
            "type": "schema"
          }
        }
      ],
      "formats": [
        "oas2"
      ]
    },
    "oas3-api-servers": {
      "description": "OpenAPI \"servers\" must be present and non-empty array.",
      "recommended": true,
      "given": "$",
      "then": [
        {
          "field": "servers",
          "function": "schema",
          "functionOptions": {
            "dialect": "draft7",
            "schema": {
              "items": {
                "type": "object"
              },
              "minItems": 1,
              "type": "array"
            }
          }
        }
      ],
      "formats": [
        "isOas3"
      ]
    },
    "oas3-callbacks-in-callbacks": {
      "recommended": true,
      "given": [
        "#OperationObject.callbacks[*][*][*].callbacks"
      ],
      "then": [
        {
          "function": "undefined"
        }
      ],
      "formats": [
        "isOas3"
      ]
    },
    "oas3-examples-value-or-externalValue": {
      "description": "Examples must have either \"value\" or \"externalValue\" field.",
      "recommended": true,
      "given": [
        "$.components.examples[*]",
        "$.paths[*][*]..content[*].examples[*]",
        "$.paths[*][*]..parameters[*].examples[*]",
        "$.components.parameters[*].examples[*]",
        "$.paths[*][*]..headers[*].examples[*]",
        "$.components.headers[*].examples[*]"
      ],
      "then": [
        {
          "function": "xor",
          "functionOptions": {
            "properties": [
              "externalValue",
              "value"
            ]
          }
        }
      ],
      "formats": [
        "isOas3"
      ]
    },
    "oas3-operation-security-defined": {
      "description": "Operation \"security\" values must match a scheme defined in the \"components.securitySchemes\" object.",
      "recommended": true,
      "given": "#SecurityRequirementObject",
      "then": [
        {
          "function": "oasSecurityDefined",
          "functionOptions": {
            "oasVersion": 3
          }
        }
      ],
      "formats": [
        "isOas3"
      ]
    },
    "oas3-parameter-description": {
      "description": "Parameter objects must have \"description\".",
      "recommended": false,
      "given": [
        "#PathItem.parameters[?(@ && @.in)]",
        "#OperationObject.parameters[?(@ && @.in)]",
        "$.components.parameters[?(@ && @.in)]"
      ],
      "then": [
        {
          "field": "description",
          "function": "truthy"
        }
      ],
      "formats": [
        "isOas3"
      ]
    },
    "oas3-schema": {
      "description": "Validate structure of OpenAPI v3 specification.",
      "severity": 0,
      "recommended": true,
      "given": "$",
      "then": [
        {
          "function": "oasDocumentSchema"
        }
      ],
      "formats": [
        "isOas3"
      ]
    },
    "oas3-server-not-example.com": {
      "description": "Server URL must not point at example.com.",
      "recommended": false,
      "given": "$.servers[*].url",
      "then": [
        {
          "function": "pattern",
          "functionOptions": {
            "notMatch": "example\\.com"
          }
        }
      ],
      "formats": [
        "isOas3"
      ]
    },
    "oas3-server-trailing-slash": {
      "description": "Server URL must not have trailing slash.",
      "recommended": true,
      "given": "$.servers[*].url",
      "then": [
        {
          "function": "pattern",
          "functionOptions": {
            "notMatch": "./$"
          }
        }
      ],
      "formats": [
        "isOas3"
      ]
    },
    "oas3-server-variables": {
      "description": "Server variables must be defined and valid and there must be no unused variables.",
      "severity": 0,
      "recommended": true,
      "given": [
        "$.servers[*]",
        "#PathItem.servers[*]",
        "#OperationObject.servers[*]",
        "#LinkObject.server"
      ],
      "then": [
        {
          "function": "serverVariables",
          "functionOptions": {
            "checkSubstitutions": true,
            "requireDefault": true
          }
        }
      ]
    },
    "oas3-unused-component": {
      "recommended": true,
      "given": "$",
      "then": [
        {
          "function": "oasUnusedComponent"
        }
      ],
      "formats": [
        "isOas3"
      ]
    },
    "oas3-valid-media-example": {
      "description": "Examples must be valid against their defined schema.",
      "severity": 0,
      "recommended": true,
      "given": [
        "$..content..[?(@ && @.schema && (@.example !== void 0 || @.examples))]",
        "$..headers..[?(@ && @.schema && (@.example !== void 0 || @.examples))]",
        "$..parameters..[?(@ && @.schema && (@.example !== void 0 || @.examples))]"
      ],
      "then": [
        {
          "function": "oasExample",
          "functionOptions": {
            "schemaField": "schema",
            "oasVersion": 3,
            "type": "media"
          }
        }
      ],
      "formats": [
        "isOas3"
      ]
    },
    "oas3-valid-schema-example": {
      "description": "Examples must be valid against their defined schema.",
      "severity": 0,
      "recommended": true,
      "given": [
        "$.components.schemas..[?(@property !== 'properties' && @ && (@ && @.example !== void 0 || @.default !== void 0) && (@.enum || @.type || @.format || @.$ref || @.properties || @.items))]",
        "$..content..[?(@property !== 'properties' && @ && (@ && @.example !== void 0 || @.default !== void 0) && (@.enum || @.type || @.format || @.$ref || @.properties || @.items))]",
        "$..headers..[?(@property !== 'properties' && @ && (@ && @.example !== void 0 || @.default !== void 0) && (@.enum || @.type || @.format || @.$ref || @.properties || @.items))]",
        "$..parameters..[?(@property !== 'properties' && @ && (@ && @.example !== void 0 || @.default !== void 0) && (@.enum || @.type || @.format || @.$ref || @.properties || @.items))]"
      ],
      "then": [
        {
          "function": "oasExample",
          "functionOptions": {
            "schemaField": "$",
            "oasVersion": 3,
            "type": "schema"
          }
        }
      ],
      "formats": [
        "isOas3"
      ]
    },
    "oas3_1-callbacks-in-webhook": {
      "recommended": true,
      "given": [
        "$.webhooks[*][*].callbacks"
      ],
      "then": [
        {
          "function": "undefined"
        }
      ],
      "formats": [
        "oas3_1",
        "oas3_2"
      ]
    },
    "oas3_1-servers-in-webhook": {
      "recommended": true,
      "given": [
        "$.webhooks.servers",
        "$.webhooks[*][*].servers"
      ],
      "then": [
        {
          "function": "undefined"
        }
      ],
      "formats": [
        "oas3_1",
        "oas3_2"
      ]
    },
    "oas3_2-no-deprecated-xml-attribute": {
      "recommended": true,
      "given": [
        "$..[?(@ && @.xml)].xml"
      ],
      "then": [
        {
          "function": "schema",
          "functionOptions": {
            "schema": {
              "not": {
                "properties": {
                  "attribute": {
                    "const": true
                  }
                },
                "required": [
                  "attribute"
                ]
              }
            }
          }
        }
      ],
      "formats": [
        "oas3_2"
      ]
    },
    "openapi-tags": {
      "description": "OpenAPI object must have non-empty \"tags\" array.",
      "recommended": false,
      "given": "$",
      "then": [
        {
          "field": "tags",
          "function": "schema",
          "functionOptions": {
            "dialect": "draft7",
            "schema": {
              "type": "array",
              "minItems": 1
            }
          }
        }
      ]
    },
    "openapi-tags-alphabetical": {
      "description": "OpenAPI object must have alphabetical \"tags\".",
      "recommended": false,
      "given": "$",
      "then": [
        {
          "field": "tags",
          "function": "alphabetical",
          "functionOptions": {
            "keyedBy": "name"
          }
        }
      ]
    },
    "openapi-tags-uniqueness": {
      "description": "Each tag must have a unique name.",
      "severity": "error",
      "recommended": true,
      "given": "$.tags",
      "then": [
        {
          "function": "uniquenessTags"
        }
      ]
    },
    "operation-description": {
      "description": "Operation \"description\" must be present and non-empty string.",
      "recommended": true,
      "given": "#OperationObject",
      "then": [
        {
          "field": "description",
          "function": "truthy"
        }
      ]
    },
    "operation-operationId": {
      "description": "Operation must have \"operationId\".",
      "recommended": true,
      "given": "#OperationObject",
      "then": [
        {
          "field": "operationId",
          "function": "truthy"
        }
      ]
    },
    "operation-operationId-unique": {
      "description": "Every operation must have unique \"operationId\".",
      "severity": 0,
      "recommended": true,
      "given": "$.paths",
      "then": [
        {
          "function": "oasOpIdUnique"
        }
      ]
    },
    "operation-operationId-valid-in-url": {
      "recommended": true,
      "given": "#OperationObject",
      "then": [
        {
          "field": "operationId",
          "function": "pattern",
          "functionOptions": {
            "match": "^[A-Za-z0-9-._~:/?#\\[\\]@!\\$&'()*+,;=]*$"
          }
        }
      ]
    },
    "operation-parameters": {
      "description": "Operation parameters are unique and non-repeating.",
      "recommended": true,
      "given": "#OperationObject.parameters",
      "then": [
        {
          "function": "oasOpParams"
        }
      ]
    },
    "operation-singular-tag": {
      "description": "Operation must not have more than a single tag.",
      "recommended": false,
      "given": "#OperationObject",
      "then": [
        {
          "field": "tags",
          "function": "length",
          "functionOptions": {
            "max": 1
          }
        }
      ]
    },
    "operation-success-response": {
      "description": "Operation must have at least one \"2xx\" or \"3xx\" response.",
      "recommended": true,
      "given": "#OperationObject",
      "then": [
        {
          "field": "responses",
          "function": "oasOpSuccessResponse"
        }
      ]
    },
    "operation-tag-defined": {
      "description": "Operation tags must be defined in global tags.",
      "recommended": true,
      "given": "$",
      "then": [
        {
          "function": "oasTagDefined"
        }
      ]
    },
    "operation-tags": {
      "description": "Operation must have non-empty \"tags\" array.",
      "recommended": true,
      "given": "#OperationObject",
      "then": [
        {
          "field": "tags",
          "function": "schema",
          "functionOptions": {
            "dialect": "draft7",
            "schema": {
              "type": "array",
              "minItems": 1
            }
          }
        }
      ]
    },
    "path-declarations-must-exist": {
      "recommended": true,
      "given": "$.paths",
      "then": [
        {
          "field": "@key",
          "function": "pattern",
          "functionOptions": {
            "notMatch": "{}"
          }
        }
      ]
    },
    "path-keys-no-trailing-slash": {
      "recommended": true,
      "given": "$.paths",
      "then": [
        {
          "field": "@key",
          "function": "pattern",
          "functionOptions": {
            "notMatch": ".+\\/$"
          }
        }
      ]
    },
    "path-not-include-query": {
      "description": "Path must not include query string.",
      "recommended": true,
      "given": "$.paths",
      "then": [
        {
          "field": "@key",
          "function": "pattern",
          "functionOptions": {
            "notMatch": "\\?"
          }
        }
      ]
    },
    "path-params": {
      "description": "Path parameters must be defined and valid.",
      "severity": 0,
      "recommended": true,
      "given": "$.paths",
      "then": [
        {
          "function": "oasPathParam"
        }
      ]
    },
    "tag-description": {
      "description": "Tag object must have \"description\".",
      "recommended": false,
      "given": "$.tags[*]",
      "then": [
        {
          "field": "description",
          "function": "truthy"
        }
      ]
    },
    "typed-enum": {
      "description": "Enum values must respect the specified type.",
      "recommended": true,
      "given": "$..[?(@ && @.enum && @.type)]",
      "then": [
        {
          "function": "typedEnum"
        }
      ]
    }
  }
} as const;
