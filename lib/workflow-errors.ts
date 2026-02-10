export const PROVIDER_ERROR_PREFIX = "WF_PROVIDER_ERROR::"

export type WorkflowErrorObject = {
  kind: string
  message: string
  code?: string
  provider?: string
  model?: string
  summary?: string
  details?: string
}

export function toWorkflowErrorObject(rawMessage: string): WorkflowErrorObject {
  const markerIndex = rawMessage.indexOf(PROVIDER_ERROR_PREFIX)
  if (markerIndex !== -1) {
    const payloadText = rawMessage
      .slice(markerIndex + PROVIDER_ERROR_PREFIX.length)
      .trim()

    try {
      const payload = JSON.parse(payloadText) as Partial<WorkflowErrorObject>
      const fallbackMessage =
        payload.summary ??
        payload.details ??
        payload.message ??
        "Provider video generation failed."

      return {
        kind: payload.kind ?? "provider_error",
        message: fallbackMessage,
        code: payload.code,
        provider: payload.provider,
        model: payload.model,
        summary: payload.summary,
        details: payload.details,
      }
    } catch {
      return {
        kind: "provider_error_parse_failed",
        message: payloadText || "Failed to parse provider error payload.",
      }
    }
  }

  return {
    kind: "workflow_error",
    message: rawMessage,
  }
}
