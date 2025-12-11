import { useStore } from "@nanostores/react"
import { useCallback, useEffect, useRef } from "react"
import {
	createStreamingUIMessageState,
	processUIMessageStream,
} from "./process-ui-message-stream"
import { $chatError, $chatMessages, $chatStatus } from "./store"
import { streamChat } from "./stream"
import type {
	ChatRequestOptions,
	CreateMessage,
	Message,
	UseChatHelpers,
	UseChatOptions,
} from "./types"
import { ChatStatus } from "./types"
import { consumeStream } from "./utils/consume-stream"
import { generateId } from "./utils/generate-id"

export function useChat<T extends Message = Message>(
	options: UseChatOptions = {},
): UseChatHelpers<T> {
	const messages = useStore($chatMessages) as T[]
	const status = useStore($chatStatus)
	const error = useStore($chatError)

	const setMessages = useCallback(
		(messages: T[] | ((messages: T[]) => T[])) => {
			if (typeof messages === "function") {
				$chatMessages.set(messages($chatMessages.get() as T[]) as Message[])
			} else {
				$chatMessages.set(messages as Message[])
			}
		},
		[],
	)

	const abortControllerRef = useRef<AbortController | null>(null)

	// Initialize messages if provided
	useEffect(() => {
		if (options.initialMessages) {
			$chatMessages.set(options.initialMessages)
		}
	}, [])

	const append = useCallback(
		async (
			message: Message | CreateMessage,
			chatRequestOptions?: ChatRequestOptions,
		) => {
			const { useChatOptions, ...requestOptions } = {
				useChatOptions: options,
				...chatRequestOptions,
			}

			const { role: _ignoredRole, ...restMessage } = message
			const userMessage: Message = {
				id: message.id || generateId(),
				role: "user",
				parts: [{ type: "text", text: message.content }],
				...restMessage,
			}
			const currentMessages = $chatMessages.get()

			$chatMessages.set([...currentMessages, userMessage])
			$chatStatus.set(ChatStatus.Submitted)
			$chatError.set(undefined)

			try {
				let api = useChatOptions?.api || "/api/chat"
				let headers: Record<string, string> = {
					"Content-Type": "application/json",
					...(useChatOptions?.headers as Record<string, string>),
					...(requestOptions?.headers as Record<string, string>),
				}
				let body: any = {
					messages: [...currentMessages, userMessage],
					...useChatOptions?.body,
					...requestOptions?.body,
				}

				if (useChatOptions?.prepareSendMessagesRequest) {
					const prepared = await useChatOptions.prepareSendMessagesRequest({
						messages: [...currentMessages, userMessage],
						headers,
						body,
					})
					api = prepared.api
					headers = prepared.headers
					body = prepared.body
				}

				if (!useChatOptions?.streamTransformer) {
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

				$chatStatus.set(ChatStatus.Streaming)

				const assistantMessageId = generateId()
				const streamingState = createStreamingUIMessageState({
					lastMessage: messages.at(-1) as Message | undefined,
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

							const newMessages = [
								...currentMessages,
								userMessage,
								clonedMessage,
							]

							$chatMessages.set(newMessages)
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
					...currentMessages,
					userMessage,
					{
						...finalMessage,
						parts: (finalMessage.parts ?? []).map((p) => ({ ...p }) as any),
					},
				]

				$chatMessages.set(finalMessages)
				$chatStatus.set(ChatStatus.Ready)

				if (useChatOptions?.onFinish) {
					useChatOptions.onFinish(finalMessage, {
						usage: {},
						finishReason: streamingState.finishReason ?? "stop",
					})
				}
				abortControllerRef.current = null
				return null
			} catch (error) {
				abortControllerRef.current = null
				$chatStatus.set(ChatStatus.Ready)
				$chatError.set(error as Error)
				if (useChatOptions?.onError) {
					useChatOptions.onError(error as Error)
				}
				throw error
			}
		},
		[],
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
			const currentMessages = $chatMessages.get()
			if (currentMessages.length === 0) return null

			const lastMessage = currentMessages[currentMessages.length - 1]
			if (lastMessage.role === "assistant") {
				// Remove last assistant message and retry
				const newMessages = currentMessages.slice(0, -1)
				$chatMessages.set(newMessages)

				// Find the last user message to resend?
				// Actually reload usually means re-trigger generation based on history.
				// We need to trigger generation without adding a new user message.
				// But our sendMessageAction expects a message to append.
				// We might need to refactor sendMessageAction or create a reloadAction.

				// For now, let's just say we don't support reload fully in this MVP or implement it later.
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
		messages,
		error,
		reload,
		stop,
		setMessages,
		isLoading: status === ChatStatus.Streaming,
		status,
		sendMessage,
		append,
	}
}
