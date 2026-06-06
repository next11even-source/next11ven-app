const WEBHOOK_URL = process.env.MAKE_ALERT_WEBHOOK_URL

export function reportError(route: string, error: unknown, details?: string): void {
  if (!WEBHOOK_URL) return
  const message = error instanceof Error ? error.message : String(error)
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      route,
      error: message,
      details: details ?? '',
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {})
}
