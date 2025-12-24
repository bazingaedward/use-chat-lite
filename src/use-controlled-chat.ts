import { useCallback, useEffect, useRef } from "react"
import {
	createStreamingUIMessageState,
	processUIMessageStream,
} from "./process-ui-message-stream"
import { streamChat } from "./stream"
import type {
	ChatRequestOptions,
	CreateMessage,
	Message,
	UseControlledChatHelpers,
	UseControlledChatOptions,
} from "./types"
import { ChatStatus } from "./types"
import { consumeStream } from "./utils/consume-stream"
import { generateId } from "./utils/generate-id"

export const useControlledChat = <T extends Message = Message>(
	options: UseControlledChatOptions<T>,
): UseControlledChatHelpers => {
	const latestOptionsRef = useRef(options)
	const inFlightRef = useRef(false)

	useEffect(() => {
		latestOptionsRef.current = options
	}, [options])

	const abortControllerRef = useRef<AbortController | null>(null)

	const setStatus = useCallback((nextStatus: ChatStatus) => {
		latestOptionsRef.current.onStatusChange?.(nextStatus)
	}, [])

	const setError = useCallback((nextError: Error | undefined) => {
		latestOptionsRef.current.onErrorChange?.(nextError)
	}, [])

	const append = useCallback(
		async (
			message: Message | CreateMessage,
			chatRequestOptions?: ChatRequestOptions,
		) => {
			if (inFlightRef.current) {
				return null
			}
			inFlightRef.current = true
			const latest = latestOptionsRef.current
			const {
				messages: currentMessages,
				onMessagesChange,
				...useChatOptions
			} = latest

			const { role: _ignoredRole, ...restMessage } = message
			const userMessage: Message = {
				id: message.id || generateId(),
				role: "user",
				...restMessage,
			}
			const baseMessages = currentMessages as Message[]

			onMessagesChange([...baseMessages, userMessage] as T[])
			setStatus(ChatStatus.Submitted)
			setError(undefined)

			try {
				let api = useChatOptions.api || "/api/chat"
				let headers: Record<string, string> = {
					"Content-Type": "application/json",
					...(useChatOptions.headers as Record<string, string>),
					...(chatRequestOptions?.headers as Record<string, string>),
				}
				let body: any = {
					messages: [...currentMessages, userMessage],
					...useChatOptions.body,
					...chatRequestOptions?.body,
				}

				if (useChatOptions.prepareSendMessagesRequest) {
					const prepared = await useChatOptions.prepareSendMessagesRequest({
						messages: [...currentMessages, userMessage],
						headers,
						body,
					})
					api = prepared.api
					headers = prepared.headers
					body = prepared.body
				}

				if (!useChatOptions.streamTransformer) {
					throw new Error("streamTransformer is required")
				}

				const abortController = new AbortController()
				abortControllerRef.current = abortController

				const stream = await streamChat(api, {
					method: "POST",
					headers,
					body: JSON.stringify(body),
					streamTransformer: useChatOptions.streamTransformer,
					signal: abortController.signal,
				})

				setStatus(ChatStatus.Streaming)

				const assistantMessageId = generateId()
				const streamingState = createStreamingUIMessageState({
					lastMessage: currentMessages.at(-1) as Message | undefined,
					messageId: assistantMessageId,
				})

				const runUpdateMessageJob = async (
					job: (options: {
						state: typeof streamingState
						write: () => void
					}) => Promise<void>,
				) => {
					await job({
						state: streamingState,
						write: () => {
							const clonedMessage: Message = {
								...streamingState.message,
								parts: (streamingState.message.parts ?? []).map(
									(part) =>
										({
											...part,
										}) as any,
								),
							}

							onMessagesChange([
								...baseMessages,
								userMessage,
								clonedMessage,
							] as T[])
						},
					})
				}

				await consumeStream({
					stream: processUIMessageStream({
						stream,
						onToolCall: useChatOptions?.onToolCall,
						onData: useChatOptions?.onData,
						messageMetadataSchema: useChatOptions?.messageMetadataSchema,
						dataPartSchemas: useChatOptions?.dataPartSchemas,
						runUpdateMessageJob,
						onError: (err) => {
							throw err
						},
					}),
					onError: (err) => {
						throw err
					},
				})

				const finalMessage = streamingState.message
				const finalMessages = [
					...baseMessages,
					userMessage,
					{
						...finalMessage,
						parts: (finalMessage.parts ?? []).map((p) => ({ ...p }) as any),
					},
				] as T[]

				onMessagesChange(finalMessages)
				setStatus(ChatStatus.Ready)

				if (useChatOptions.onFinish) {
					useChatOptions.onFinish(finalMessage, {
						usage: {},
						finishReason: streamingState.finishReason ?? "stop",
					})
				}

				abortControllerRef.current = null
				inFlightRef.current = false
				return null
			} catch (error) {
				abortControllerRef.current = null
				inFlightRef.current = false
				setStatus(ChatStatus.Ready)
				setError(error as Error)
				useChatOptions.onError?.(error as Error)
				throw error
			}
		},
		[setError, setStatus],
	)

	const sendMessage = useCallback(
		async (
			message: Message | CreateMessage,
			chatRequestOptions?: ChatRequestOptions,
		) => {
			return append(message, chatRequestOptions)
		},
		[append],
	)

	const reload = useCallback(
		async (_chatRequestOptions?: ChatRequestOptions) => {
			const currentMessages = latestOptionsRef.current.messages
			if (currentMessages.length === 0) return null

			const lastMessage = currentMessages[currentMessages.length - 1]
			if (lastMessage.role === "assistant") {
				return null
			}

			return null
		},
		[],
	)

	const stop = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort()
			abortControllerRef.current = null
		}
	}, [])

	return {
		reload,
		stop,
		sendMessage,
	}
}
