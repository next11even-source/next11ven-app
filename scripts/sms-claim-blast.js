/**
 * sms-claim-blast.js
 * Sends claim SMS to unclaimed migrated users.
 * Run with --test to send only to TEST_NUMBER first.
 * Run with --dry-run to log recipients without sending.
 *
 * Usage:
 *   node scripts/sms-claim-blast.js --test       (sends to your number only)
 *   node scripts/sms-claim-blast.js --dry-run    (logs all targets, no sends)
 *   node scripts/sms-claim-blast.js              (sends to all eligible users)
 */

require('dotenv').config({ path: '.env.local' })
const twilio = require('twilio')
const { createClient } = require('@supabase/supabase-js')

const TEST_NUMBER = '+447426596697'
const MESSAGE = 'NEW NEXT11VEN PLATFORM is finally here! Claim your account, it takes less than a minute: https://app.next11ven.com/claim'

const args = process.argv.slice(2)
const IS_TEST = args.includes('--test')
const DRY_RUN = args.includes('--dry-run')

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  if (IS_TEST) {
    console.log(`\n[TEST MODE] Sending to ${TEST_NUMBER} only`)
    console.log(`Message: "${MESSAGE}"\n`)
    if (!DRY_RUN) {
      const msg = await client.messages.create({
        body: MESSAGE,
        from: process.env.TWILIO_FROM_NUMBER,
        to: TEST_NUMBER,
      })
      console.log(`Sent — SID: ${msg.sid}, Status: ${msg.status}`)
    } else {
      console.log('[DRY RUN] Would send — skipping')
    }
    return
  }

  // Fetch unclaimed users: sms_opt_in true, has phone, never logged in
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone')
    .eq('sms_opt_in', true)
    .is('last_active', null)
    .not('phone', 'is', null)

  if (error) {
    console.error('Supabase error:', error.message)
    process.exit(1)
  }

  console.log(`\nFound ${users.length} unclaimed users with sms_opt_in=true\n`)

  if (DRY_RUN) {
    users.forEach((u, i) => console.log(`${i + 1}. ${u.full_name} — ${u.phone}`))
    console.log('\n[DRY RUN] No messages sent.')
    return
  }

  let sent = 0
  let failed = 0

  for (const user of users) {
    try {
      const msg = await client.messages.create({
        body: MESSAGE,
        from: process.env.TWILIO_FROM_NUMBER,
        to: user.phone,
      })
      console.log(`✓ ${user.full_name} (${user.phone}) — SID: ${msg.sid}`)
      sent++
    } catch (err) {
      console.error(`✗ ${user.full_name} (${user.phone}) — ${err.message}`)
      failed++
    }
    await sleep(1000) // 1 per second to stay within Twilio rate limits
  }

  console.log(`\nDone. Sent: ${sent} | Failed: ${failed}`)
}

main()
