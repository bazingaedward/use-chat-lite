export interface ChatRequestOptions {
	headers?: Record<string, string> | Headers
	body?: any
	data?: any
}

export type ToolInvocation =
	| {
			state: "call"
			toolCallId: string
			toolName: string
			args: any
	  }
	| {
			state: "result"
			toolCallId: string
			toolName: string
			args: any
			result: any
	  }

export type MessagePart =
	| {
			type: "text"
			text: string
	  }
	| {
			type: "tool-invocation"
			toolInvocation: ToolInvocation
	  }
	| {
			type: "reasoning"
			text: string
			details?: Array<{ type: "text"; text: string; signature?: string }>
	  }
	| {
			type: "dynamic-tool"
			[key: string]: any
	  }
	| {
			type: "source-url"
			[key: string]: any
	  }
	| {
			type: "source"
			[key: string]: any
	  }
	| {
			type: "source-document"
			[key: string]: any
	  }
	| {
			type: "file"
			[key: string]: any
	  }
	| {
			type: "image"
			[key: string]: any
	  }

export interface Message {
	id: string
	role: "system" | "user" | "assistant" | "data"
	parts?: MessagePart[]
	createdAt?: Date
	toolInvocations?: ToolInvocation[]
	experimental_attachments?: any[]
	annotations?: any[]
}

// Minimal copy from AI SDK definitions so src/ui can be removed later.
// Flexible schema placeholder; replace with actual type if SDK typings are added.
type FlexibleSchema = any
export type UIDataTypesToSchemas<T extends Record<string, unknown> = any> = {
	[K in keyof T]: FlexibleSchema
}

export type CreateMessage = {
	id?: string
	role: Message["role"]
	content: string
	parts?: Message["parts"]
}

export enum ChatMode {
	Controlled = "controlled",
	Uncontrolled = "uncontrolled",
}

export enum ChatStatus {
	Streaming = "streaming",
	Ready = "ready",
	Submitted = "submitted",
}

export interface UseChatOptions {
	api?: string
	id?: string
	initialMessages?: Message[]
	initialInput?: string
	onFinish?: (
		message: Message,
		options: { usage: any; finishReason: any },
	) => void
	onError?: (error: Error) => void
	onResponse?: (response: Response) => void
	headers?: Record<string, string> | Headers
	body?: any
	credentials?: RequestCredentials
	sendExtraMessageFields?: boolean
	mode?: ChatMode
	generateId?: () => string
	onToolCall?: (options: { toolCall: any }) => void | Promise<void>
	messageMetadataSchema?: any
	dataPartSchemas?: UIDataTypesToSchemas<any>

	prepareSendMessagesRequest?: (params: {
		messages: Message[]
		headers: Record<string, string>
		body: any
	}) =>
		| Promise<{
				api: string
				headers: Record<string, string>
				body: any
		  }>
		| {
				api: string
				headers: Record<string, string>
				body: any
		  }

	// Stream transformer
	streamTransformer?: TransformStream<any, any>

	// Callback for custom data chunks (like the original onData)
	onData?: (data: any) => void
}

export interface UseControlledChatOptions<T extends Message = Message>
	extends Omit<UseChatOptions, "initialMessages"> {
	messages: T[]
	status: ChatStatus
	error?: Error
	onMessagesChange: (messages: T[] | ((messages: T[]) => T[])) => void
	onStatusChange?: (status: ChatStatus) => void
	onErrorChange?: (error: Error | undefined) => void
}

export interface UseChatHelpers<T extends Message = Message> {
	messages: T[]
	error: undefined | Error
	append: (
		message: Message | CreateMessage,
		chatRequestOptions?: ChatRequestOptions,
	) => Promise<string | null | undefined>
	reload: (
		chatRequestOptions?: ChatRequestOptions,
	) => Promise<string | null | undefined>
	stop: () => void
	setMessages: (messages: T[] | ((messages: T[]) => T[])) => void
	isLoading: boolean
	status: ChatStatus
	sendMessage: (
		message: Message | CreateMessage,
		chatRequestOptions?: ChatRequestOptions,
	) => Promise<string | null | undefined>
}

export interface UseControlledChatHelpers {
	reload: (
		chatRequestOptions?: ChatRequestOptions,
	) => Promise<string | null | undefined>
	stop: () => void
	sendMessage: (
		message: Message | CreateMessage,
		chatRequestOptions?: ChatRequestOptions,
	) => Promise<string | null | undefined>
}
