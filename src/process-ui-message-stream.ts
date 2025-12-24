import type { Message, MessagePart } from "./types"
import {
	isDataUIMessageChunk,
	isToolOrDynamicToolUIPart,
	isToolUIPart,
	validateTypes,
} from "./utils/process-ui-helpers"

export type StreamingUIMessageState = {
	message: Message & { parts: MessagePart[]; metadata?: any }
	partialToolCalls: Record<
		string,
		{
			text: string
			toolName: string
			index: number
			dynamic?: boolean
			title?: string
		}
	>
	activeTextParts: Record<
		string,
		{ type: "text"; text: string; state?: "streaming" | "done" }
	>
	activeReasoningParts: Record<
		string,
		{ type: "reasoning"; text: string; state?: "streaming" | "done" }
	>
	finishReason?: string
}

export function createStreamingUIMessageState({
	lastMessage,
	messageId,
}: {
	lastMessage: Message | undefined
	messageId: string
}): StreamingUIMessageState {
	return {
		message:
			lastMessage?.role === "assistant"
				? ({
						...lastMessage,
						parts: [...(lastMessage.parts || []).map((p) => ({ ...p }) as any)],
				  } as Message & { parts: MessagePart[] })
				: ({
						id: messageId,
						role: "assistant",
						content: "",
						parts: [],
				  } as Message & { parts: MessagePart[] }),
		partialToolCalls: {},
		activeTextParts: {},
		activeReasoningParts: {},
	}
}

export function processUIMessageStream({
	stream,
	onToolCall,
	onData,
	messageMetadataSchema: _messageMetadataSchema,
	dataPartSchemas: _dataPartSchemas,
	runUpdateMessageJob,
	onError,
}: {
	stream: ReadableStream<any>
	onToolCall?: (options: { toolCall: any }) => void | Promise<void>
	onData?: (data: any) => void
	messageMetadataSchema?: any
	dataPartSchemas?: any
	runUpdateMessageJob: (
		job: (options: {
			state: StreamingUIMessageState
			write: () => void
		}) => Promise<void>,
	) => Promise<void>
	onError: (error: unknown) => void
}): ReadableStream<any> {
	const dataPartSchemas = _dataPartSchemas
	return stream.pipeThrough(
		new TransformStream<any, any>({
			async transform(chunk, controller) {
				try {
					await runUpdateMessageJob(async ({ state, write }) => {
						function getToolInvocation(toolCallId: string) {
							const toolInvocations = state.message.parts.filter(
								isToolOrDynamicToolUIPart as (part: any) => boolean,
							)
							const toolInvocation = toolInvocations.find(
								(invocation: any) => invocation.toolCallId === toolCallId,
							)
							if (!toolInvocation) {
								throw new Error(
									`no tool invocation found for tool call ${toolCallId}`,
								)
							}
							return toolInvocation
						}

						function updateToolPart(
							options: {
								toolName: string
								toolCallId: string
								providerExecuted?: boolean
								title?: string
							} & (
								| {
										state: "input-streaming"
										input: unknown
										providerExecuted?: boolean
								  }
								| {
										state: "input-available"
										input: unknown
										providerExecuted?: boolean
										providerMetadata?: any
								  }
								| {
										state: "output-available"
										input: unknown
										output: unknown
										providerExecuted?: boolean
										preliminary?: boolean
								  }
								| {
										state: "output-error"
										input: unknown
										rawInput?: unknown
										errorText: string
										providerExecuted?: boolean
										providerMetadata?: any
								  }
							),
						) {
							const part = state.message.parts.find(
								(p: any) =>
									isToolUIPart(p) && p.toolCallId === options.toolCallId,
							) as any

							const anyOptions = options as any

							if (part) {
								part.state = options.state
								part.toolName = options.toolName
								part.input = anyOptions.input
								part.output = anyOptions.output
								part.errorText = anyOptions.errorText
								part.rawInput = anyOptions.rawInput ?? part.rawInput
								part.preliminary = anyOptions.preliminary
								part.providerExecuted =
									anyOptions.providerExecuted ?? part.providerExecuted
								if (options.title !== undefined) part.title = options.title
								if (
									anyOptions.providerMetadata &&
									options.state === "input-available"
								) {
									part.callProviderMetadata = anyOptions.providerMetadata
								}
							} else {
								const newPart: any = {
									type: `tool-${options.toolName}`,
									toolCallId: options.toolCallId,
									toolName: options.toolName,
									state: options.state,
									input: anyOptions.input,
									output: anyOptions.output,
									rawInput: anyOptions.rawInput,
									errorText: anyOptions.errorText,
									providerExecuted: anyOptions.providerExecuted,
									preliminary: anyOptions.preliminary,
									title: options.title,
									...(anyOptions.providerMetadata
										? { callProviderMetadata: anyOptions.providerMetadata }
										: {}),
								}
								;(state.message.parts as any[]).push(newPart)
							}
						}

						function updateDynamicToolPart(
							options: {
								toolName: string
								toolCallId: string
								providerExecuted?: boolean
								title?: string
							} & (
								| { state: "input-streaming"; input: unknown }
								| {
										state: "input-available"
										input: unknown
										providerMetadata?: any
								  }
								| {
										state: "output-available"
										input: unknown
										output: unknown
										preliminary: boolean | undefined
								  }
								| {
										state: "output-error"
										input: unknown
										errorText: string
										providerMetadata?: any
								  }
							),
						) {
							const part = state.message.parts.find(
								(p: any) =>
									p.type === "dynamic-tool" &&
									p.toolCallId === options.toolCallId,
							) as any

							const anyOptions = options as any

							if (part) {
								part.state = options.state
								part.toolName = options.toolName
								part.input = anyOptions.input
								part.output = anyOptions.output
								part.errorText = anyOptions.errorText
								part.rawInput = anyOptions.rawInput ?? part.rawInput
								part.preliminary = anyOptions.preliminary
								part.providerExecuted =
									anyOptions.providerExecuted ?? part.providerExecuted
								if (options.title !== undefined) part.title = options.title
								if (
									anyOptions.providerMetadata &&
									options.state === "input-available"
								) {
									part.callProviderMetadata = anyOptions.providerMetadata
								}
							} else {
								const newPart: any = {
									type: "dynamic-tool",
									toolCallId: options.toolCallId,
									toolName: options.toolName,
									state: options.state,
									input: anyOptions.input,
									output: anyOptions.output,
									errorText: anyOptions.errorText,
									preliminary: anyOptions.preliminary,
									providerExecuted: anyOptions.providerExecuted,
									title: options.title,
									...(anyOptions.providerMetadata
										? { callProviderMetadata: anyOptions.providerMetadata }
										: {}),
								}
								;(state.message.parts as any[]).push(newPart)
							}
						}

						async function updateMessageMetadata(metadata: unknown) {
							if (metadata != null) {
								const rawMergedMetadata =
									state.message.metadata != null
										? {
												...(state.message.metadata as any),
												...(metadata as any),
										  }
										: metadata

								// eslint-disable-next-line @typescript-eslint/no-unused-vars
								const { customComponents, name, ...mergedMetadata } =
									(rawMergedMetadata as any) || {}

								state.message.metadata = mergedMetadata as any
							}
						}
						switch (chunk?.type) {
							case "text-start": {
								const part = {
									type: "text" as const,
									text: "",
									state: "streaming" as const,
								}
								if (chunk.id) state.activeTextParts[chunk.id] = part
								state.message.parts.push(part as any)
								write()
								break
							}
							case "text-delta": {
								if (chunk.id && state.activeTextParts[chunk.id]) {
									state.activeTextParts[chunk.id].text +=
										chunk.delta ?? chunk.textDelta ?? ""
								} else {
									let last = state.message.parts[
										state.message.parts.length - 1
									] as any
									if (!last || last.type !== "text") {
										last = { type: "text", text: "" }
										state.message.parts.push(last)
									}
									last.text += chunk.delta ?? chunk.textDelta ?? ""
								}
								write()
								break
							}
							case "text-end": {
								if (chunk.id && state.activeTextParts[chunk.id]) {
									state.activeTextParts[chunk.id].state = "done"
									delete state.activeTextParts[chunk.id]
								}
								write()
								break
							}
							case "reasoning-start": {
								const part = {
									type: "reasoning" as const,
									text: "",
									state: "streaming" as const,
								}
								if (chunk.id) state.activeReasoningParts[chunk.id] = part
								state.message.parts.push(part as any)
								write()
								break
							}
							case "reasoning-delta": {
								if (chunk.id && state.activeReasoningParts[chunk.id]) {
									state.activeReasoningParts[chunk.id].text +=
										chunk.delta ?? chunk.textDelta ?? ""
								}
								write()
								break
							}
							case "reasoning-end": {
								if (chunk.id && state.activeReasoningParts[chunk.id]) {
									state.activeReasoningParts[chunk.id].state = "done"
									delete state.activeReasoningParts[chunk.id]
								}
								write()
								break
							}
							case "tool-input-start": {
								const toolInvocations = state.message.parts.filter(
									(part: any) => part?.toolCallId != null,
								)
								state.partialToolCalls[chunk.toolCallId] = {
									text: "",
									toolName: chunk.toolName,
									index: toolInvocations.length,
									dynamic: chunk.dynamic,
									title: chunk.title,
								}

								if (chunk.dynamic) {
									updateDynamicToolPart({
										toolCallId: chunk.toolCallId,
										toolName: chunk.toolName,
										state: "input-streaming",
										input: undefined,
										providerExecuted: chunk.providerExecuted,
										title: chunk.title,
									})
								} else {
									updateToolPart({
										toolCallId: chunk.toolCallId,
										toolName: chunk.toolName,
										state: "input-streaming",
										input: undefined,
										providerExecuted: chunk.providerExecuted,
										title: chunk.title,
									})
								}

								write()
								break
							}
							case "tool-input-delta": {
								const partialToolCall = state.partialToolCalls[chunk.toolCallId]
								if (!partialToolCall) break
								partialToolCall.text +=
									chunk.inputTextDelta ?? chunk.argsTextDelta ?? ""

								let partialArgs: any = undefined
								try {
									partialArgs = JSON.parse(partialToolCall.text)
								} catch {
									partialArgs = partialToolCall.text
								}

								if (partialToolCall.dynamic) {
									updateDynamicToolPart({
										toolCallId: chunk.toolCallId,
										toolName: partialToolCall.toolName,
										state: "input-streaming",
										input: partialArgs,
										title: partialToolCall.title,
									})
								} else {
									updateToolPart({
										toolCallId: chunk.toolCallId,
										toolName: partialToolCall.toolName,
										state: "input-streaming",
										input: partialArgs,
										title: partialToolCall.title,
									})
								}

								write()
								break
							}
							case "tool-input-available": {
								if (chunk.dynamic) {
									updateDynamicToolPart({
										toolCallId: chunk.toolCallId,
										toolName: chunk.toolName,
										state: "input-available",
										input: chunk.input,
										providerExecuted: chunk.providerExecuted,
										providerMetadata: chunk.providerMetadata,
										title: chunk.title,
									})
								} else {
									updateToolPart({
										toolCallId: chunk.toolCallId,
										toolName: chunk.toolName,
										state: "input-available",
										input: chunk.input,
										providerExecuted: chunk.providerExecuted,
										providerMetadata: chunk.providerMetadata,
										title: chunk.title,
									})
								}

								write()

								if (onToolCall && !chunk.providerExecuted) {
									await onToolCall({ toolCall: chunk.toolCall ?? chunk })
								}
								break
							}
							case "tool-input-error": {
								if (chunk.dynamic) {
									updateDynamicToolPart({
										toolCallId: chunk.toolCallId,
										toolName: chunk.toolName,
										state: "output-error",
										input: chunk.input,
										errorText: chunk.errorText,
										providerExecuted: chunk.providerExecuted,
										providerMetadata: chunk.providerMetadata,
									})
								} else {
									updateToolPart({
										toolCallId: chunk.toolCallId,
										toolName: chunk.toolName,
										state: "output-error",
										input: undefined,
										rawInput: chunk.input,
										errorText: chunk.errorText,
										providerExecuted: chunk.providerExecuted,
										providerMetadata: chunk.providerMetadata,
									})
								}

								write()
								break
							}
							case "tool-approval-request": {
								const toolInvocation = getToolInvocation(chunk.toolCallId)
								;(toolInvocation as any).state = "approval-requested"
								;(toolInvocation as any).approval = { id: chunk.approvalId }
								write()
								break
							}
							case "tool-output-denied": {
								const toolInvocation = getToolInvocation(chunk.toolCallId)
								;(toolInvocation as any).state = "output-denied"
								write()
								break
							}
							case "tool-output-available": {
								const toolInvocation = getToolInvocation(chunk.toolCallId)
								if ((toolInvocation as any).type === "dynamic-tool") {
									updateDynamicToolPart({
										toolCallId: chunk.toolCallId,
										toolName: (toolInvocation as any).toolName,
										state: "output-available",
										input: (toolInvocation as any).input,
										output: chunk.output,
										preliminary: chunk.preliminary,
										providerExecuted: chunk.providerExecuted,
										title: (toolInvocation as any).title,
									})
								} else {
									updateToolPart({
										toolCallId: chunk.toolCallId,
										toolName: (toolInvocation as any).toolName ?? "",
										state: "output-available",
										input: (toolInvocation as any).input,
										output: chunk.output,
										providerExecuted: chunk.providerExecuted,
										preliminary: chunk.preliminary,
										title: (toolInvocation as any).title,
									})
								}
								write()
								break
							}
							case "tool-output-error": {
								const toolInvocation = getToolInvocation(chunk.toolCallId)
								if ((toolInvocation as any).type === "dynamic-tool") {
									updateDynamicToolPart({
										toolCallId: chunk.toolCallId,
										toolName: (toolInvocation as any).toolName,
										state: "output-error",
										input: (toolInvocation as any).input,
										errorText: chunk.errorText,
										providerExecuted: chunk.providerExecuted,
										title: (toolInvocation as any).title,
									})
								} else {
									updateToolPart({
										toolCallId: chunk.toolCallId,
										toolName: (toolInvocation as any).toolName ?? "",
										state: "output-error",
										input: (toolInvocation as any).input,
										rawInput: (toolInvocation as any).rawInput,
										errorText: chunk.errorText,
										providerExecuted: chunk.providerExecuted,
										title: (toolInvocation as any).title,
									})
								}
								write()
								break
							}
							case "start-step": {
								state.message.parts.push({ type: "step-start" } as any)
								break
							}
							case "finish-step": {
								state.activeTextParts = {}
								state.activeReasoningParts = {}
								break
							}
							case "start": {
								if (chunk.messageId != null) {
									state.message.id = chunk.messageId
								}

								await updateMessageMetadata(chunk.messageMetadata)

								if (chunk.messageId != null || chunk.messageMetadata != null) {
									write()
								}
								break
							}
							case "finish": {
								if (chunk.finishReason != null) {
									state.finishReason = chunk.finishReason
								}
								await updateMessageMetadata(chunk.messageMetadata)
								if (chunk.messageMetadata != null) {
									write()
								}
								break
							}
							case "message-metadata": {
								await updateMessageMetadata(chunk.messageMetadata)
								if (chunk.messageMetadata != null) {
									write()
								}
								break
							}
							default: {
								if (isDataUIMessageChunk(chunk)) {
									if (dataPartSchemas?.[chunk.type] != null) {
										await validateTypes({
											value: chunk.data,
											schema: dataPartSchemas[chunk.type],
										})
									}

									const dataChunk = chunk as any

									if (dataChunk.transient) {
										onData?.(dataChunk)
										break
									}

									const existingUIPart =
										dataChunk.id != null
											? (state.message.parts.find(
													(part: any) =>
														dataChunk.type === part.type &&
														dataChunk.id === part.id,
											  ) as any)
											: undefined

									if (existingUIPart != null) {
										existingUIPart.data = dataChunk.data
									} else {
										state.message.parts.push(dataChunk as any)
									}

									onData?.(dataChunk)
									write()
								}
							}
						}
					})

					controller.enqueue(chunk)
				} catch (err) {
					onError(err)
				}
			},
		}),
	)
}
