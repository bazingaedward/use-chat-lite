import { EventSourceParserStream } from "eventsource-parser/stream"
export async function streamChat(
	url: string,
	options: RequestInit & {
		streamTransformer: TransformStream<any, any>
	},
): Promise<ReadableStream<any>> {
	const response = await fetch(url, options)

	if (!response.ok) {
		throw new Error(`Failed to fetch: ${response.statusText}`)
	}

	if (!response.body) {
		throw new Error("No response body")
	}

	return response.body
		.pipeThrough(new TextDecoderStream())
		.pipeThrough(new EventSourceParserStream())
		.pipeThrough(options.streamTransformer)
}
