import { createGateway } from "ai"
import { Agent } from "undici"

/**
 * Next.js instrumentation hook — runs once on server startup.
 *
 * Sets the AI SDK global default provider to a custom AI Gateway instance
 * with extended Undici timeouts.  Video generation via KlingAI can take
 * 5-12 minutes; Node.js's default Undici timeout is only 5 minutes, which
 * causes requests to fail.  By configuring the global default here, every
 * AI SDK call (including plain-string model IDs like
 * "google/gemini-3-pro-image") automatically gets the extended timeouts.
 *
 * @see https://vercel.com/docs/ai-gateway/capabilities/video-generation#extending-timeouts-for-node.js
 */
// Create a single long-lived Agent instance (reused across all requests)
const longTimeoutAgent = new Agent({
  headersTimeout: 15 * 60 * 1000, // 15 minutes
  bodyTimeout: 15 * 60 * 1000, // 15 minutes
})

export async function register() {
  globalThis.AI_SDK_DEFAULT_PROVIDER = createGateway({
    fetch: (url, init) =>
      fetch(url, {
        ...init,
        dispatcher: longTimeoutAgent, // Reuse the same agent
      } as any),
  })
}
