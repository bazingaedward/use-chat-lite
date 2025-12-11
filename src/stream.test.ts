import { describe, it, expect, vi, beforeEach } from 'vitest'
import { streamChat } from './stream'

describe('streamChat', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should throw error if fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
    } as Response)

    await expect(streamChat('http://test.com', {
      streamTransformer: new TransformStream()
    })).rejects.toThrow('Failed to fetch: Not Found')
  })

  it('should throw error if no response body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    } as Response)

    await expect(streamChat('http://test.com', {
      streamTransformer: new TransformStream()
    })).rejects.toThrow('No response body')
  })

  it('should return a stream on success', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: hello\n\n'))
        controller.close()
      }
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    } as Response)

    const stream = await streamChat('http://test.com', {
      streamTransformer: new TransformStream()
    })

    expect(stream).toBeInstanceOf(ReadableStream)
  })
})
