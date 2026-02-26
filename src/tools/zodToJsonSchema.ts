/**
 * Zod to JSON Schema conversion utility
 *
 * Converts Zod schemas to JSON Schema format for LLM tool descriptions.
 * This is used to generate tool parameter schemas for the bindTools() API.
 *
 * Compatible with Zod v4.x - uses built-in toJSONSchema() when available
 */

import { z } from "zod";

/**
 * JSON Schema type definitions
 */
export type JSONSchemaType = "string" | "number" | "boolean" | "object" | "array" | "integer" | "null";

/**
 * JSON Schema interface compatible with OpenAI/Anthropic tool definitions
 */
export interface JSONSchema {
  type?: JSONSchemaType | JSONSchemaType[];
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  format?: string;
  additionalProperties?: boolean | JSONSchema;
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  oneOf?: JSONSchema[];
}

/**
 * Convert a Zod schema to JSON Schema format
 *
 * Uses Zod v4's built-in toJSONSchema() method when available,
 * with fallback for edge cases.
 *
 * @param schema - The Zod schema to convert
 * @returns JSON Schema object
 */
export function zodToJsonSchema(schema: z.ZodType): JSONSchema {
  // Use Zod v4's built-in toJSONSchema if available
  if (typeof (schema as any).toJSONSchema === "function") {
    try {
      const result = (schema as any).toJSONSchema();
      // Remove the $schema property as it's not needed for LLM tool definitions
      const { $schema, ...rest } = result;
      return rest as JSONSchema;
    } catch {
      // Fall through to manual conversion if toJSONSchema fails
    }
  }

  // Fallback: manual conversion for edge cases
  return fallbackZodToJsonSchema(schema);
}

/**
 * Fallback manual conversion for when toJSONSchema is not available
 */
function fallbackZodToJsonSchema(schema: z.ZodType): JSONSchema {
  const zodType = (schema as any)._def?.type;
  const def = (schema as any)._def;

  // Handle wrapper types first
  if (zodType === "optional" || zodType === "nullable") {
    const inner = def?.innerType || def?.type;
    if (inner) {
      return fallbackZodToJsonSchema(inner);
    }
    return {};
  }

  if (zodType === "default") {
    const inner = def?.innerType || def?.type;
    const defaultValue = def?.defaultValue?.();
    const result = inner ? fallbackZodToJsonSchema(inner) : {};
    if (defaultValue !== undefined) {
      result.default = defaultValue;
    }
    return result;
  }

  // Handle string types
  if (zodType === "string") {
    const jsonSchema: JSONSchema = { type: "string" };
    if (def?.format) jsonSchema.format = def.format;
    if (def?.minLength != null) jsonSchema.minLength = def.minLength;
    if (def?.maxLength != null) jsonSchema.maxLength = def.maxLength;
    if (def?.pattern) jsonSchema.pattern = def.pattern;
    return jsonSchema;
  }

  // Handle number types
  if (zodType === "number") {
    const jsonSchema: JSONSchema = { type: "number" };
    if (def?.minimum != null) jsonSchema.minimum = def.minimum;
    if (def?.maximum != null) jsonSchema.maximum = def.maximum;

    const checks = def?.checks || [];
    for (const check of checks) {
      if (check.kind === "int") jsonSchema.type = "integer";
      if (check.kind === "min" && typeof check.value === "number") {
        jsonSchema.minimum = check.value;
        if (check.inclusive === false) jsonSchema.exclusiveMinimum = check.value;
      }
      if (check.kind === "max" && typeof check.value === "number") {
        jsonSchema.maximum = check.value;
        if (check.inclusive === false) jsonSchema.exclusiveMaximum = check.value;
      }
    }
    return jsonSchema;
  }

  // Handle boolean types
  if (zodType === "boolean") {
    return { type: "boolean" };
  }

  // Handle null/undefined
  if (zodType === "null" || zodType === "undefined" || zodType === "void") {
    return { type: "null" };
  }

  // Handle array types
  if (zodType === "array") {
    const element = def?.element || def?.type;
    const jsonSchema: JSONSchema = {
      type: "array",
      items: element ? fallbackZodToJsonSchema(element) : {},
    };
    if (def?.minLength != null) jsonSchema.minItems = def.minLength;
    if (def?.maxLength != null) jsonSchema.maxItems = def.maxLength;
    return jsonSchema;
  }

  // Handle object types
  if (zodType === "object") {
    const shape = def?.shape || {};
    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodType;
      properties[key] = fallbackZodToJsonSchema(fieldSchema);

      const fieldType = getZodType(fieldSchema);
      if (fieldType !== "optional" && fieldType !== "nullable" && fieldType !== "default") {
        required.push(key);
      }
    }

    const jsonSchema: JSONSchema = {
      type: "object",
      properties,
    };
    if (required.length > 0) {
      jsonSchema.required = required;
    }
    return jsonSchema;
  }

  // Handle enum types
  if (zodType === "enum" || zodType === "nativeEnum") {
    const entries = def?.entries || def?.values;
    return {
      type: "string",
      enum: entries ? Object.values(entries) : [],
    };
  }

  // Handle union types
  if (zodType === "union") {
    const options = def?.options || def?.members;
    if (Array.isArray(options)) {
      return {
        anyOf: options.map((opt: z.ZodType) => fallbackZodToJsonSchema(opt)),
      };
    }
  }

  // Handle literal types
  if (zodType === "literal") {
    const value = def?.value;
    const jsonSchema: JSONSchema = { enum: [value] };
    if (typeof value === "string") jsonSchema.type = "string";
    else if (typeof value === "number") jsonSchema.type = "number";
    else if (typeof value === "boolean") jsonSchema.type = "boolean";
    return jsonSchema;
  }

  // Handle catch/unknown/any
  if (zodType === "catch" || zodType === "unknown" || zodType === "any") {
    return {};
  }

  // Handle date types
  if (zodType === "date") {
    return { type: "string", format: "date-time" };
  }

  // Handle record types
  if (zodType === "record") {
    const valueType = def?.valueType;
    return {
      type: "object",
      additionalProperties: valueType ? fallbackZodToJsonSchema(valueType) : {},
    };
  }

  // Handle transform/pipe/readonly - unwrap
  if (zodType === "transform" || zodType === "pipe" || zodType === "readonly" || zodType === "lazy") {
    const inner = def?.innerType || def?.type || def?.schema || def?.getter?.();
    if (inner) {
      return fallbackZodToJsonSchema(inner);
    }
  }

  return {};
}

function getZodType(schema: z.ZodType): string | undefined {
  return (schema as any)._def?.type;
}

/**
 * Convert Zod schema to JSON Schema string
 *
 * @param schema - The Zod schema to convert
 * @param indent - Indentation for pretty printing (default: 2)
 * @returns JSON Schema string
 */
export function zodToJsonSchemaString(schema: z.ZodType, indent: number = 2): string {
  const jsonSchema = zodToJsonSchema(schema);
  return JSON.stringify(jsonSchema, null, indent);
}

/**
 * Convert Zod schema to OpenAI tool parameters format
 *
 * @param schema - The Zod schema to convert
 * @returns OpenAI-compatible parameters object
 */
export function zodToOpenAIParams(schema: z.ZodType): {
  type: "object";
  properties: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
} {
  const jsonSchema = zodToJsonSchema(schema);

  return {
    type: "object" as const,
    properties: jsonSchema.properties || {},
    required: jsonSchema.required,
    description: jsonSchema.description,
  };
}
