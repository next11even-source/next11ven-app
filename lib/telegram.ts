// Telegram Bot API helper — server-side only.
//
// Reuses the same bot already wired into the Make scenarios. Set:
//   TELEGRAM_BOT_TOKEN       — bot token from BotFather (same one Make uses)
//   TELEGRAM_REPORT_CHAT_ID  — chat ID to send the weekly report to
//
// Feature-flagged off when either env var is missing (logs + no-ops, never throws).

const TELEGRAM_API = 'https://api.telegram.org'

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_REPORT_CHAT_ID

  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_REPORT_CHAT_ID not set — skipping send')
    return false
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[telegram] sendMessage failed: ${res.status} ${body}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[telegram] sendMessage threw:', err)
    return false
  }
}
