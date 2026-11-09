import { z } from "zod";

const RESEARCH_SCHEMA_NAME = "research_output";

export function jsonSchemaResponseFormat(schema: z.ZodType): Record<string, unknown> {
	return {
		type: "json_schema",
		json_schema: { name: RESEARCH_SCHEMA_NAME, strict: true, schema: z.toJSONSchema(schema) },
	};
}

export function parseSchemaJson<T>(schema: z.ZodType<T>, content: string): T {
	return schema.parse(JSON.parse(content));
}
