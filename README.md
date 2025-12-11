# use-chat-lite

A lightweight, flexible React hook for building chat interfaces, inspired by Vercel AI SDK but with enhanced control and customization. Built with [Nanostores](https://github.com/nanostores/nanostores) for efficient state management.

## Features

- 🚀 **Lightweight**: Minimal dependencies, focused on core chat functionality.
- 🎮 **Controlled Mode**: Full control over message state with `useControlledChat`.
- 🌊 **Custom Stream Support**: Define your own `streamTransformer` to handle any stream format.
- ⚛️ **React Hooks**: Easy to integrate with existing React applications.
- 📝 **TypeScript**: Fully typed for better developer experience.

## Installation

```bash
pnpm add use-chat-lite
# or
npm install use-chat-lite
# or
yarn add use-chat-lite
```

## Usage

### Uncontrolled Mode (`useChat`)

Use `useChat` when you want the library to manage the chat state for you.

```tsx
import { useChat } from 'use-chat-lite';

// Define a transformer to parse your stream
const myStreamTransformer = new TransformStream({
  transform(chunk, controller) {
    // Implement your parsing logic here
    // This is just a simple example assuming text chunks
    const text = new TextDecoder().decode(chunk);
    controller.enqueue(text);
  },
});

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: '/api/chat',
    streamTransformer: myStreamTransformer, // Required
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          {m.role}: {m.content}
        </div>
      ))}
      
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit" disabled={status === 'streaming'}>Send</button>
      </form>
    </div>
  );
}
```

### Controlled Mode (`useControlledChat`)

Use `useControlledChat` when you need to manage the message state yourself (e.g., in a global store or parent component).

```tsx
import { useState } from 'react';
import { useControlledChat, ChatStatus, Message } from 'use-chat-lite';

export default function ControlledChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ChatStatus>(ChatStatus.Ready);
  const [error, setError] = useState<Error>();
  const [input, setInput] = useState('');

  const { append, stop } = useControlledChat({
    messages,
    onMessagesChange: setMessages,
    status,
    onStatusChange: setStatus,
    error,
    onErrorChange: setError,
    api: '/api/chat',
    streamTransformer: myStreamTransformer, // Required
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await append({ role: 'user', content: input });
    setInput('');
  };

  return (
    <div>
      {/* Render messages */}
      {messages.map(m => (
        <div key={m.id}>{m.content}</div>
      ))}
      
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={e => setInput(e.target.value)} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

### Customizing Requests

You can customize the request before it is sent using `prepareSendMessagesRequest`.

```tsx
useChat({
  // ...
  prepareSendMessagesRequest: async ({ messages, headers, body }) => {
    // Add custom headers or modify body
    return {
      api: '/api/custom-chat',
      headers: {
        ...headers,
        'Authorization': 'Bearer token',
      },
      body: {
        ...body,
        customField: 'value',
      },
    };
  },
});
```

## API Reference

### `useChat(options)`

#### Options

- `api`: string (default: `'/api/chat'`) - The API endpoint to send the chat request to.
- `streamTransformer`: `TransformStream` (Required) - A stream transformer to parse the response stream.
- `initialMessages`: `Message[]` - Initial messages to populate the chat.
- `onFinish`: `(message: Message, options: any) => void` - Callback when the stream finishes.
- `onError`: `(error: Error) => void` - Callback when an error occurs.
- `prepareSendMessagesRequest`: Function to customize the request.

#### Returns

- `messages`: `Message[]` - The current list of messages.
- `input`: `string` - The current input value.
- `handleInputChange`: `(e: React.ChangeEvent<HTMLInputElement>) => void` - Handler for input changes.
- `handleSubmit`: `(e: React.FormEvent) => void` - Handler for form submission.
- `append`: `(message: Message | CreateMessage) => Promise<void>` - Function to append a message.
- `stop`: `() => void` - Function to stop the stream.
- `status`: `ChatStatus` - The current status of the chat (`ready`, `submitted`, `streaming`).

### `useControlledChat(options)`

#### Options

- `messages`: `Message[]` (Required) - The current list of messages.
- `onMessagesChange`: `(messages: Message[]) => void` (Required) - Callback to update messages.
- `status`: `ChatStatus` (Required) - The current status.
- `onStatusChange`: `(status: ChatStatus) => void` - Callback to update status.
- ...and other options from `useChat`.

## License

MIT
