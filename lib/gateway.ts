import { createGateway } from "ai"
import { Agent } from "undici"

/**
 * Custom AI Gateway instance with extended timeouts for video generation.
 * Video generation can take 10+ minutes, but Node.js (via Undici) defaults
 * to a 5-minute timeout. This gateway extends both header and body timeouts
 * to 15 minutes.
 */
export const gateway = createGateway({
  fetch: (url, init) =>
    fetch(url, {
      ...init,
      dispatcher: new Agent({
        headersTimeout: 15 * 60 * 1000, // 15 minutes
        bodyTimeout: 15 * 60 * 1000, // 15 minutes
      }),
    } as RequestInit),
})
