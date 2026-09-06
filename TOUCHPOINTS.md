# NEXT11VEN — Customer Touchpoint Registry

Every message the platform sends a user, across every channel. Source of truth for "what does a player/coach actually receive and when."

**Rules**
- One row per distinct message/trigger. If Resend fires an email AND Twilio fires an SMS for the same event, that's two rows.
- Update this file when you ship any messaging change — not a follow-up task.
- "Status" matters as much as content: a flow that exists but never fires is a support liability. Flag it, don't delete it.

**Columns**
- **Channel**: Email / SMS / In-app
- **System**: Resend / MailerLite / Twilio / Supabase (in-app)
- **Trigger**: exact event
- **Audience**: who receives it
- **Frequency / cap**: cadence and any send limit
- **Status**: Live / Deprecated / Dead
- **Code location**: file or route
- **Last verified**: last date confirmed correct

**Verification note**: entries marked "28 Aug 2026" were verified by code audit (route exists, function called, guards match) — not by triggering a live send. Re-verify live if a dependency (Resend/Twilio/MailerLite config, env flags) changed since.

---

## Email frequency governor

**Last updated: 6 Sep 2026**

Every automated email flow now routes through a shared ledger in `touchpoint_log` (migration `20260904000001`). Two functions in `lib/touchpoint.ts`:

**email_events table** (migration `20260906000001`) — Live. Stores one row per Resend webhook event for analytics. Service-role only; never exposed to anon/authenticated clients. Powers `/dashboard/admin/email-analytics`. Webhook receiver at `/api/webhooks/resend` (Svix signature-verified). See Known Gaps for setup steps.

- `logTouch(supabase, recipientId, channel, flow)` — called after a successful send. Records what went out and when.
- `canSendTouch(supabase, recipientId, channel, gapHours)` — called before a send. Checks whether *any* email on that channel landed within the last N hours, across *all* flows. Fails open (allows the send) if the query errors.

**What this gives you:**
- A coach who just got an application nudge won't also get an activation email the same day.
- A broadcast sent Wednesday morning blocks that afternoon's cron from also sending to the same person.
- The ledger is the single place to answer "what did this user receive and when?" — not scattered logs.

**What it does NOT do yet:**
- There is no queue. A send blocked by `canSendTouch` is **skipped**, not deferred. For recurring crons (weekly, daily) this is fine — the next run naturally retries. For one-off sends (a broadcast blocked for a specific user) that email is lost to that recipient for that run.
- There is no priority weighting. A transactional email (payment failed, application accepted) does not jump ahead of a marketing email. Both flow through the same channel check. In practice this is fine because Tier 1 sends (transactional) are wired **without** a `canSendTouch` gate — they always fire — while Tier 2/3 (batch, marketing) are gated. But the tiers are enforced by convention in each cron/route, not by the ledger itself.
- Adding a true priority queue (a `email_queue` table, a drain cron, tier-aware scheduling) is future work when volume justifies it.

**Tier classification** — enforced at call sites, not by the ledger:
- **Tier 1** — transactional. Never gated by `canSendTouch`. Always sends. `logTouch` after send (for visibility only). Includes: payment failed, application decisions, message notifications, purchase confirmations.
- **Tier 2** — batch engagement. Weekly/daily crons. `canSendTouch` gated before send, `logTouch` after. Includes: weekly digest, coach recommendations, application nudge, coach activation, drip sequence.
- **Tier 3** — marketing. `canSendTouch` gated + `email_marketing_opt_out` respected + unsubscribe link required. Includes: win-back, broadcast composer sends.

---

## Onboarding

**Last updated: 6 Sep 2026**

The onboarding path is gated by the `native_onboarding` feature flag (in `feature_flags` table, checked via `isNativeOnboardingEnabled()`). Default is `false` (MailerLite). Flip to `true` to cut over; flip back to roll back without redeploy.

**Phase 1 (current, `native_onboarding = false`):** MailerLite handles onboarding sequences.

**Phase 2 (`native_onboarding = true`):** Native drip_jobs sequences (steps 10–21) handle onboarding. MailerLite still tags upgrades (concurrent until Phase 3 decommission) but does NOT send duplicate onboarding emails.

| Channel | System | Trigger | Audience | Frequency / cap | Status | Code location | Last verified |
|---|---|---|---|---|---|---|---|
| Email | MailerLite | Player signup approved | Players (group `181864482947991450`) | One-off | Live — **when `native_onboarding = false`** | `lib/mailerlite.ts` (`onUserApproved`) — called from `app/api/admin/review/route.ts` and `app/api/account/convert/route.ts` | 28 Aug 2026 |
| Email | MailerLite | Coach signup approved | Coaches (group `181864480498517498`) | One-off | Live — **when `native_onboarding = false`** | Same — `onUserApproved` is role-aware | 28 Aug 2026 |
| Email | Resend | Player onboarding D0 — welcome + profile CTA (step 10) | Newly approved players | Fires at approval. No opt-out suppression (welcome email). `logTouch(player_onboarding_d0)` | **Phase 2 — when `native_onboarding = true`** | `sendPlayerOnboardingD0Email`, `app/api/cron/drip-reminders` (step 10). Seeded by `app/api/admin/review/route.ts` at approval | 6 Sep 2026 |
| Email | Resend | Player onboarding D1 — profile completion nudge (step 11) | Newly approved players | 1 day after approval. Respects `email_marketing_opt_out`. `logTouch(player_onboarding_d1)` | **Phase 2 — when `native_onboarding = true`** | `sendPlayerOnboardingD1Email`, `app/api/cron/drip-reminders` (step 11). Leads with playing history pitch. Shows ranked missing fields (top 5 from `COMPLETION_CHECKS`, with `career_stats` + `performance_matches` counts fetched per player). Empty list → "looks solid" path | 6 Sep 2026 |
| Email | Resend | Player onboarding D3 — coaches are here (step 12) | Newly approved players | 3 days after approval. Respects `email_marketing_opt_out`. `canSendTouch(24h)` guard — defers (not skips) if another email went out same day. `logTouch(player_onboarding_d3)` | **Phase 2 — when `native_onboarding = true`** | `sendPlayerOnboardingD3Email`, `app/api/cron/drip-reminders` (step 12). Stat: approved coach count (platform total, all-time) | 6 Sep 2026 |
| Email | Resend | Player onboarding D7 — Premium pitch (step 13) | Newly approved players | 7 days after approval. Respects `email_marketing_opt_out`. `canSendTouch(24h)` guard — defers (not skips) if another email went out same day. `logTouch(player_onboarding_d7)` | **Phase 2 — when `native_onboarding = true`** | `sendPlayerOnboardingD7Email`, `app/api/cron/drip-reminders` (step 13). Stat: open role count for player's position + region (floor 3). 4 outcome-led Pro benefit cards + price anchor | 6 Sep 2026 |
| Email | Resend | Coach onboarding D0 — welcome + first opportunity CTA (step 14) | Newly approved coaches | Fires at approval. No opt-out suppression (welcome email). `logTouch(coach_onboarding_d0)` | **Phase 2 — when `native_onboarding = true`** | `sendCoachOnboardingD0Email`, `app/api/cron/drip-reminders` (step 14). Stat: total approved player count | 6 Sep 2026 |
| Email | Resend | Coach onboarding D2 — post your first role (step 15) | Newly approved coaches | 2 days after approval. Respects `email_marketing_opt_out`. `logTouch(coach_onboarding_d2)` | **Phase 2 — when `native_onboarding = true`** | `sendCoachOnboardingD2Email`, `app/api/cron/drip-reminders` (step 15). Stat: regional player count for coach's city (floor 3) | 6 Sep 2026 |
| Email | Resend | Coach onboarding D5 — proof / credibility (step 16) | Newly approved coaches | 5 days after approval. Respects `email_marketing_opt_out`. `logTouch(coach_onboarding_d5)` | **Phase 2 — when `native_onboarding = true`** | `sendCoachOnboardingD5Email`, `app/api/cron/drip-reminders` (step 16). Stat: active-recruiting coach count (active opp OR message in last 30 days, floor 5); fallback: all-time opportunity count. Secondary Coach Pro section pitching performance dashboard | 6 Sep 2026 |
| Auth email | Supabase Auth | Password reset / magic link | Any user requesting reset; migrated users via `/claim` | Conditional | Live — **unbranded** (Supabase stock template, no custom Resend equivalent) | `app/page.tsx` (`supabase.auth.resetPasswordForEmail`); `/claim` + `/set-password` | 28 Aug 2026 |
| Founder notification | Make webhook | Fan → player/coach conversion | Founder (Jamal) | One-off per conversion | Live | `app/api/account/convert/route.ts` | 28 Aug 2026 |
| Email | MailerLite | Fan signup | Fans | One-off | **Deprecated** — structurally can't fire. Fan signup closed 12 Aug 2026. | `automation 181949488153574619` (never routed) | 28 Aug 2026 |

---

## Engagement / retention

**Last updated: 6 Sep 2026**

| Channel | System | Trigger | Audience | Frequency / cap | Status | Code location | Last verified |
|---|---|---|---|---|---|---|---|
| Email | Resend | Coach activation D7 — approved coach, never posted AND never messaged, 7+ days since join | Approved coaches with zero opportunities ever-posted AND zero messages ever-sent | Weekly (Wed 09:00 UTC). Fires once per coach. `canSendTouch(48h)` cross-flow guard + `logTouch(coach_activation_d7)` after send | **Live** — 6 Sep 2026 (eligibility broadened: messaging now counts as "active") | `app/api/cron/coach-activation`, `sendCoachActivationD7Email`. Angle: region player count (actively-looking players in coach's city; platform total if city unset or <3 matches). Fresh DB check at send time (opp + message). `?dryRun=1` + `?to=<email>` | 6 Sep 2026 |
| Email | Resend | Coach activation D21 — still inactive, 14+ days after D7 | Same coaches, after D7 sent, ≥14 days later | Weekly (Wed 09:00 UTC). Fires once per coach. `canSendTouch(48h)` + `logTouch(coach_activation_d21)` | **Live** — 6 Sep 2026 | Same cron, `sendCoachActivationD21Email`. Angle: social proof (coaches who posted this week — different lever from D7). After D21, coach drops out of dedicated nudging | 6 Sep 2026 |
| Email | Resend | Coach gone quiet D1 — has posted before AND has not posted OR messaged in ≥28 days | Approved coaches who posted at least once ever, but with no opportunity AND no message in the last 28 days | Weekly (Fri 09:00 UTC). Fires once per coach. `canSendTouch(48h)` cross-flow guard + `logTouch(coach_gone_quiet_d1)` after send | **Live** — 6 Sep 2026 (eligibility broadened: recent messaging exempts coaches from gone-quiet) | `app/api/cron/coach-gone-quiet`, `sendCoachGoneQuietD1Email`. Angle: new players since last post. `hasPostedEver` stays opportunities-only — a coach must have posted at least once to qualify; only "recently active" broadens. `?dryRun=1` + `?to=<email>` | 6 Sep 2026 |
| Email | Resend | Coach gone quiet D14 — still silent, 14+ days after D1 | Same coaches, after D1 sent, ≥14 days later | Weekly (Fri 09:00 UTC). Fires once per coach. `canSendTouch(48h)` + `logTouch(coach_gone_quiet_d14)` | **Live** — 6 Sep 2026 | Same cron, `sendCoachGoneQuietD14Email`. Angle: social proof (coaches who posted this week — different lever from D1). After D14, coach drops out of dedicated nudging | 6 Sep 2026 |
| Email | Resend | Win-back — subscription cancelled | Players/coaches whose subscription cancelled | Once per cancellation. `logTouch(winback)`. Respects `email_marketing_opt_out` | **Live** — rebuilt 4 Sep 2026 | `sendSubscriptionCancelledWinBackEmail`, `app/api/cron/drip-reminders`. Uses `marketingTemplate` (blue hero). Stat block is position-filtered (active roles for player's position, last 30 days) | 4 Sep 2026 |
| Email | Resend | Coach recommendations digest | All approved coaches | Weekly (Tue 08:00 UTC). `logTouch(coach_recommendations)` after send. Respects `email_marketing_opt_out` | Live | `app/api/cron/coach-recommendations`, `sendCoachRecommendationsEmail`, `lib/recommendations.ts`. Rotation state in `coach_recommendation_log` | 4 Sep 2026 (logTouch wired) |
| Email | Resend | Weekly player digest | All approved players | Weekly (Thu 08:00 UTC). `logTouch(weekly_digest)` after send. Respects `email_marketing_opt_out` | Live | `app/api/cron/weekly-digest`, `sendWeeklyDigestEmail`, `lib/weeklyDigest.ts`. Unclaimed players get a claim-your-account banner | 4 Sep 2026 (logTouch wired) |
| Email | Resend | Drip Day 3 — unread message reminder | Free players, triggering message still unread | 3 days after Day 0. `logTouch(drip_day3)` | Live | `sendDripDay3Email`, `app/api/cron/drip-reminders` (daily 09:00 UTC) | 4 Sep 2026 (logTouch wired) |
| Email + SMS | Resend + Twilio | Drip Day 7 — final reminder | Free players, triggering message still unread | 7 days after Day 0. `logTouch(drip_day7)` after each channel | Live | `sendDripDay7Email` + SMS (best-effort, `sms_opt_in` checked), `app/api/cron/drip-reminders`. Sequence aborts early if player upgrades, opts out, or reads the message | 4 Sep 2026 (logTouch wired) |
| Email | Resend | Drip Day 0 — coach messaged a free player | Free players | Triggered inline, immediate. `logTouch(drip_day0)` | Live | `sendDripDay0Email`, fired from `app/api/messages/send/route.ts`; also inserts Day 3 + Day 7 rows into `drip_jobs` | 28 Aug 2026 |
| Email + SMS | Resend + Twilio | Coach nudge — unanswered applications | Coaches with pending applications ≥3 days old on still-active roles | Daily 10:00 UTC. 1 nudge per coach per 5 days (`profiles.last_application_nudge_at`). SMS capped at 40/run, email fallback. `logTouch(application_nudge)` after each channel | Live | `app/api/cron/application-nudge`, `sendApplicationNudgeEmail`. Also carries opportunity-auto-close pre-warning as an extra line — never a separate send | 4 Sep 2026 (logTouch wired) |
| SMS | Twilio | Post-match "log your game" nudge | Players with active club stint whose likely match day is today, haven't logged | Daily 18:00 UTC. `sms_opt_in` + 1/day `last_sms_at` cap. Email fallback (`sendLogNudgeEmail`) | Live | `app/api/cron/log-nudge`, `lib/matchDay.ts`. Free — no upsell | 28 Aug 2026 |
| In-app | Supabase | Recommended players (on demand) | Coaches | On login/session | Live | `app/api/coach/recommendations/route.ts` | 28 Aug 2026 |

---

## Transactional / core flow

**Last updated: 28 Aug 2026** — Tier 1. These sends are never gated by `canSendTouch`. They always fire. `logTouch` is called after send for visibility only.

| Channel | System | Trigger | Audience | Frequency / cap | Status | Code location | Last verified |
|---|---|---|---|---|---|---|---|
| Email + SMS | Resend + Twilio | New message received | Player/Coach (recipient) | Real-time. SMS: `sms_opt_in` + 1/day cap | Live | `app/api/messages/send/route.ts` — `sendMessageNotificationEmail` + SMS | 28 Aug 2026 |
| Email | Resend | Application received | Coach | Real-time | Live | `sendApplicationReceivedEmail`, `app/api/applications/apply/route.ts` | 28 Aug 2026 |
| Email | Resend | Application accepted | Player | Real-time, always sent regardless of age | Live | `sendApplicationDecisionEmail`, `app/api/applications/[id]/route.ts`. Accepts never go stale — good news always sends | 28 Aug 2026 |
| Email | Resend | Application declined | Player | Capped 1/player/24h; only if applied <42 days ago. Silent otherwise | Live | Same route — `NOTIFY_RESOLUTION_WITHIN_DAYS` (42) in `lib/applicationResponse.ts` | 28 Aug 2026 |
| Email | Resend | Shortlist available (player status change) | Coaches who shortlisted this player | Capped 1/coach/player/week | Live | `sendShortlistAvailableEmail`, `app/api/player/status-change/route.ts` | 28 Aug 2026 |
| Email + In-app | Resend + Supabase | Stale/neglected opportunity auto-closed | Coach | Weekly (Mon 11:30 UTC), 1/coach/run listing all closed roles | Live | `app/api/cron/opportunity-close`, `sendOpportunityAutoClosedEmail`, `opportunity_auto_closed` notification | 28 Aug 2026 |
| In-app | Supabase (DB trigger) | Coach shortlists a player | Player | Real-time | Live | `POST /api/coach/shortlist` → `shortlisted` notification | 28 Aug 2026 |
| In-app | Supabase (DB trigger) | Post liked / commented / marked interested | Post author | Real-time | Live | `trg_notify_post_like`, `trg_notify_post_comment`, `trg_notify_post_interest` | 28 Aug 2026 |
| In-app | Supabase (DB trigger) | New application on a coach's opportunity | Coach | Real-time | Live | `trg_notify_new_application` | 28 Aug 2026 |
| In-app | Supabase (DB trigger) | Shortlisted player becomes available | Coach | Real-time | Live | `trg_notify_shortlist_availability`, `trg_notify_viewed_player_free_agent` | 28 Aug 2026 |
| In-app | Supabase | Application closed (no response / role gone) | Player | Weekly (Mon 11:00 UTC) + immediate on role closure. Max 4/player/run, 1 notification/player/run. 42-day window only | Live | `app/api/cron/application-close`, `lib/opportunityClosure.ts`. NO email, NO SMS | 28 Aug 2026 |
| In-app | Supabase | Message credit refunded | Player | Daily (12:00 UTC), 1/player/run. Not retroactive before 1 Aug 2026 | Live | `app/api/cron/message-credit-refund`. NO email, NO SMS — in-app only, coach never named | 28 Aug 2026 |
| — | — | Legacy: `profile_view`, `new_opportunity` notification types | — | — | **Dead** — enum values exist, nothing writes them | `notifications` type enum | 28 Aug 2026 |

---

## Billing / lifecycle

**Last updated: 6 Sep 2026**

| Channel | System | Trigger | Audience | Frequency / cap | Status | Code location | Last verified |
|---|---|---|---|---|---|---|---|
| Email + SMS | Resend + Twilio | Payment failed | Premium subscriber | On `invoice.payment_failed`. Tier 1 — always sends | Live | `sendPaymentFailedEmail` + SMS (`handlePaymentFailedNotifications`), `app/api/stripe/webhook/route.ts` | 28 Aug 2026 |
| Email | Resend | Payment failed — follow-up | Premium subscriber, payment still failed | Conditional, processed by drip cron. `logTouch(payment_failed_followup)` | Live | `sendPaymentFailedFollowUpEmail`, `app/api/cron/drip-reminders` | 4 Sep 2026 (logTouch wired) |
| Email | Resend | Subscription cancelled — win-back | Cancelled players/coaches | Once per cancellation. `marketingTemplate`. Respects `email_marketing_opt_out`. `logTouch(winback)` | Live — rebuilt 4 Sep 2026 | `sendSubscriptionCancelledWinBackEmail`, `app/api/cron/drip-reminders`. Position-filtered stat block | 4 Sep 2026 |
| Email | Resend | Message pack purchase confirmation | Player | One-off per purchase. Tier 1 | Live | `sendExtraMessagesPurchaseEmail`, `app/api/stripe/webhook/route.ts` | 28 Aug 2026 |
| Tag | MailerLite | Premium upgrade | Player/Coach on upgrade | One-off per upgrade | Live (concurrent with step 20/21 when `native_onboarding = true` — MailerLite tags, Resend sends the branded confirmation; no duplicate email) | `onUserUpgradedToPremium` (`lib/mailerlite.ts`), `app/api/stripe/webhook/route.ts` + `app/api/stripe/sync/route.ts` | 6 Sep 2026 |
| Email | Resend | Player Pro welcome (step 20) | Player on first premium activation | One-off, immediate. No opt-out suppression (transactional confirmation). `logTouch(player_pro_welcome)` | **Phase 2 — when `native_onboarding = true`** | `sendPlayerProWelcomeEmail`, `app/api/cron/drip-reminders` (step 20). Seeded by `app/api/stripe/webhook/route.ts` (`handleSubscriptionChange`) on first activation | 6 Sep 2026 |
| Email | Resend | Coach Pro welcome (step 21) | Coach on first premium activation | One-off, immediate. No opt-out suppression (transactional confirmation). `logTouch(coach_pro_welcome)` | **Phase 2 — when `native_onboarding = true`** | `sendCoachProWelcomeEmail`, `app/api/cron/drip-reminders` (step 21). Seeded by same webhook handler | 6 Sep 2026 |

---

## Admin broadcast composer

**Last updated: 4 Sep 2026**

Admin-only. Jamal is the only admin. Accessible at `/dashboard/admin/broadcast`.

| Channel | System | Trigger | Audience | Frequency / cap | Status | Code location | Last verified |
|---|---|---|---|---|---|---|---|
| Email | Resend | Manual broadcast (admin composed) | Any segment: role / tier / joined date / activity filter | Per send. `countRecentTouches` shown as pre-send warning. `logTouch(broadcast)` per recipient after send. Respects `email_marketing_opt_out`. Unsubscribe link required | **Live** — 4 Sep 2026 | `app/dashboard/admin/broadcast/page.tsx`, `app/api/admin/broadcast/preview`, `app/api/admin/broadcast/send`. Uses `marketingTemplate`. `{{name}}` personalisation supported | 4 Sep 2026 |

Note: blocked recipients (those who received another email recently) are **skipped, not queued**. A broadcast is a point-in-time send. If a recipient is suppressed by `email_marketing_opt_out` or the touchpoint check, they don't receive that broadcast ever.

---

## Internal / founder-only

**Last updated: 28 Aug 2026**

| Channel | System | Trigger | Audience | Frequency / cap | Status | Code location | Last verified |
|---|---|---|---|---|---|---|---|
| Telegram | Custom | Weekly platform metrics | Founder (Jamal) only | Weekly (Mon 08:00 UTC) | Live | `app/api/cron/weekly-metrics-telegram`, `lib/weeklyReport.ts` | 28 Aug 2026 |

---

## Known gaps

**Updated: 6 Sep 2026**

- [ ] **Resend webhook setup in progress** — Tracking subdomain `links.next11ven.com` created in Resend (6 Sep 2026), DNS CNAME pending propagation. Still to do: Resend dashboard → Webhooks → add `https://app.next11ven.com/api/webhooks/resend`, select 6 events (sent/delivered/opened/clicked/bounced/complained), copy signing secret into `RESEND_WEBHOOK_SECRET` env var on Vercel, then redeploy.
- [ ] **No email queue** — blocked sends are skipped, not deferred. Recurring crons self-heal (next run retries). Broadcast sends to suppressed recipients are permanently missed. A `email_queue` table with a drain cron is the fix when volume makes this matter.
- [ ] **No priority weighting** — tiers (Tier 1/2/3) are enforced by convention at call sites, not structurally. If two Tier 2 crons fire to the same person on the same day, whichever runs first wins and the other is skipped. No mechanism prioritises a Tier 1 send over a Tier 2 that already went out.
- [ ] **Auth emails unbranded** — password reset / magic link still uses Supabase's stock template. A custom Resend template would match the app's brand.
- [ ] **`native_onboarding` flag not yet enabled** — Phase 2 is code-complete but `native_onboarding = false` is the production default. Flip to `true` in the `feature_flags` table when ready to cut over.
- [x] ~~No migration for `drip_jobs_onboarding_unique` partial index~~ — created in migration `20260906000002_email_safety.sql`. Index exists; `upsert(onConflict: 'recipient_id,sequence_step')` in review/route.ts is safe to use.
- [x] ~~No Coach Pro upgrade confirmation email~~ — closed by step 21 (`sendCoachProWelcomeEmail`). Live in Phase 2 when `native_onboarding = true`.
- [x] ~~Fan onboarding~~ — dropped. Fan signup closed 12 Aug 2026.
- [x] ~~Full SMS audit~~ — complete. Exactly 6 send sites, all gated on `sms_opt_in` + 1/day cap.
