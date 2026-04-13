/**
 * MailerLite API v3 helper — server-side only.
 * Never import this in client components.
 */

const ML_BASE = 'https://connect.mailerlite.com/api'

const ML_GROUPS: Record<string, string> = {
  player: '181864482947991450',
  coach:  '181864480498517498',
}

const ML_TAGS: Record<string, string> = {
  player: 'player_premium',
  coach:  'coach_pro',
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${process.env.MAILERLITE_API_KEY}`,
  }
}

async function mlFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ML_BASE}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers ?? {}) },
  })
  // 204 No Content — no body to parse
  if (res.status === 204) return null
  const text = await res.text()
  try {
    return { status: res.status, data: text ? JSON.parse(text) : null }
  } catch {
    return { status: res.status, data: null }
  }
}

// ─── Find subscriber by email ─────────────────────────────────────────────────

async function findSubscriber(email: string): Promise<{ id: string } | null> {
  const result = await mlFetch(`/subscribers/${encodeURIComponent(email)}`)
  if (result?.status === 200 && result.data?.data?.id) {
    return { id: result.data.data.id }
  }
  return null
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called when admin approves a user.
 * - If subscriber already exists in MailerLite → skip entirely.
 * - If new → create and add to the correct group (triggers onboarding sequence).
 */
export async function onUserApproved(
  email: string,
  name: string | null,
  role: string | null
): Promise<void> {
  if (process.env.MAILERLITE_ENABLED === 'false') {
    console.log('[MailerLite] disabled via MAILERLITE_ENABLED flag — skipping onUserApproved')
    return
  }
  if (!process.env.MAILERLITE_API_KEY || process.env.MAILERLITE_API_KEY === 'REPLACE_ME') {
    console.warn('[MailerLite] API key not configured — skipping onUserApproved')
    return
  }

  const groupId = ML_GROUPS[role ?? '']
  if (!groupId) {
    console.warn(`[MailerLite] No group configured for role "${role}" — skipping`)
    return
  }

  // Check if they already exist — if so, do nothing
  const existing = await findSubscriber(email)
  if (existing) {
    console.log(`[MailerLite] ${email} already exists — skipping onboarding`)
    return
  }

  // Create subscriber and assign to group in one call
  const result = await mlFetch('/subscribers', {
    method: 'POST',
    body: JSON.stringify({
      email,
      name: name ?? undefined,
      groups: [groupId],
      status: 'active',
    }),
  })

  if (result?.status === 200 || result?.status === 201) {
    console.log(`[MailerLite] Created ${email} and added to group ${groupId}`)
  } else {
    console.error(`[MailerLite] Failed to create subscriber ${email}:`, result?.data)
  }
}

/**
 * Called when a user upgrades to premium (Stripe webhook fires).
 * - Finds the subscriber by email.
 * - Finds or creates the correct tag.
 * - Assigns the tag. Does not trigger any sequences.
 */
export async function onUserUpgradedToPremium(
  email: string,
  role: string | null
): Promise<void> {
  if (process.env.MAILERLITE_ENABLED === 'false') {
    console.log('[MailerLite] disabled via MAILERLITE_ENABLED flag — skipping onUserUpgradedToPremium')
    return
  }
  if (!process.env.MAILERLITE_API_KEY || process.env.MAILERLITE_API_KEY === 'REPLACE_ME') {
    console.warn('[MailerLite] API key not configured — skipping onUserUpgradedToPremium')
    return
  }

  const tagName = ML_TAGS[role ?? '']
  if (!tagName) {
    console.warn(`[MailerLite] No tag configured for role "${role}" — skipping`)
    return
  }

  // Find subscriber
  const subscriber = await findSubscriber(email)
  if (!subscriber) {
    console.warn(`[MailerLite] Subscriber ${email} not found — cannot tag`)
    return
  }

  // Find or create the tag
  const tagId = await findOrCreateTag(tagName)
  if (!tagId) {
    console.error(`[MailerLite] Could not find or create tag "${tagName}"`)
    return
  }

  // Assign tag to subscriber
  const result = await mlFetch(`/subscribers/${subscriber.id}/tags/${tagId}`, {
    method: 'POST',
  })

  if (result?.status === 200 || result?.status === 201 || result?.status === 204) {
    console.log(`[MailerLite] Tagged ${email} as "${tagName}"`)
  } else {
    console.error(`[MailerLite] Failed to tag ${email}:`, result?.data)
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function findOrCreateTag(name: string): Promise<string | null> {
  // List existing tags
  const listResult = await mlFetch('/tags?limit=100')
  if (listResult?.status === 200) {
    const tags: Array<{ id: string; name: string }> = listResult.data?.data ?? []
    const existing = tags.find(t => t.name === name)
    if (existing) return existing.id
  }

  // Create it
  const createResult = await mlFetch('/tags', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

  if (createResult?.status === 200 || createResult?.status === 201) {
    return createResult.data?.data?.id ?? null
  }

  return null
}
