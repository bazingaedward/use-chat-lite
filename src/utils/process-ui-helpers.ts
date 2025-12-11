// Helper utilities extracted from src/ui equivalents to avoid src dependency.
export function isToolUIPart(part: any): boolean {
	return typeof part?.type === "string" && part.type.startsWith("tool-")
}

export function isToolOrDynamicToolUIPart(part: any): boolean {
	return isToolUIPart(part) || part?.type === "dynamic-tool"
}

export async function validateTypes({
	value,
	schema,
}: {
	value: unknown
	schema: unknown
}) {
	if (!schema) return
	if (typeof (schema as any).parse === "function") {
		;(schema as any).parse(value)
	}
}

export function isDataUIMessageChunk(chunk: any): chunk is {
	type: string
	data: any
	id?: string
	transient?: boolean
} {
	return (
		chunk != null &&
		typeof chunk === "object" &&
		"data" in chunk &&
		typeof (chunk as any).type === "string"
	)
}
