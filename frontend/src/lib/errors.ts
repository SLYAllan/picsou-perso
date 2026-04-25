interface ApiErrorBody {
  detail?: string | null
  message?: string | null
}

function tryParseJson(s: string): ApiErrorBody | null {
  try { return JSON.parse(s) } catch { return null }
}

export function extractErrorMessage(err: unknown, fallback = 'Une erreur est survenue'): string {
  const axErr = err as { response?: { data?: ApiErrorBody }; message?: string }

  const detail = axErr?.response?.data?.detail
  if (detail && typeof detail === 'string') {
    const jsonStart = detail.indexOf('{')
    if (jsonStart >= 0) {
      const parsed = tryParseJson(detail.slice(jsonStart))
      if (parsed?.message) return parsed.message
    }
    return detail
  }

  const bodyMessage = axErr?.response?.data?.message
  if (bodyMessage && typeof bodyMessage === 'string') return bodyMessage

  const msg = axErr?.message
  if (msg && typeof msg === 'string') {
    if (msg.startsWith('{')) {
      const parsed = tryParseJson(msg)
      if (parsed?.message) return parsed.message
    }
    if (!msg.startsWith('Request failed with status code')) return msg
  }

  return fallback
}
