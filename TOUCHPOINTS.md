# NEXT11VEN — Customer Touchpoint Registry

Every message the platform sends a user, across every channel. Source of truth for "what does a player/coach actually receive and when."

**How to use this file**
- One row per distinct message/trigger, not per system. If MailerLite fires an email AND Twilio fires an SMS for the same event, that's two rows.
- Update this file as part of shipping any change to messaging — not a separate cleanup task.
- "Status" matters as much as the content: dead flows (wired but never firing, or built but not routed) are common failure points — flag them, don't delete the row.

**Columns**
- **Channel**: Email / SMS / In-app notification / Push
- **System**: Resend / MailerLite / Twilio / Supabase (in-app) / Make (routing)
- **Trigger**: the exact event that fires it
- **Audience**: who receives it (role + segment/group ID if relevant)
- **Frequency**: one-off / recurring (cadence) / conditional
- **Status**: Live / Dead (not firing) / Planned / Deprecated
- **Code location**: file, route, or automation ID
- **Last verified**: date you last confirmed it actually fires as described

**Note on "Last verified" below**: 28 Aug 2026 entries were verified by reading the code path itself (route exists, function is called, guard conditions match this description) during a full codebase audit — not by triggering a live send in production. That confirms the code is wired correctly as of that date, not that a real message landed in an inbox that day. Re-verify live if a row hasn't been touched since a dependency (Resend/Twilio/MailerLite config, env flags) changed.

---

## Onboarding

| Channel | System | Trigger | Audience | Frequency | Status | Code location | Last verified |
|---|---|---|---|---|---|---|---|
| Email | MailerLite | Player signup approved | Players (group `181864482947991450`) | One-off | Live | `lib/mailerlite.ts` (`onUserApproved`) called from `app/api/admin/review/route.ts` (approval) and `app/api/account/convert/route.ts` (fan→player instant approval) | 28 Aug 2026 |
| Email | MailerLite | Coach signup approved | Coaches (group `181864480498517498`) | One-off | Live | Same as above — `onUserApproved` is role-aware, routes to the correct group | 28 Aug 2026 |
| Email | MailerLite | Fan signup | Fans | One-off | **Deprecated** — not just unwired, structurally can't fire anymore | `automation 181949488153574619` (never routed via Make) | 28 Aug 2026 — fan signup itself closed 12 Aug 2026: `/register` offers Player/Coach only, `allowedRoles` in `/api/register/complete` rejects `'fan'`. The planned MailerLite fan-nurture sequence was dropped for this reason (CLAUDE.md Build Priorities), not merely left broken. Existing fans still browse and can self-convert via `/dashboard/become` — that path is unaffected |
| Auth email | Supabase Auth (default template) | Password reset / magic link | Any user requesting reset, or migrated user via `/claim` | Conditional | Live | `app/page.tsx:48` (`supabase.auth.resetPasswordForEmail`); `/claim` + `/set-password` for the legacy magic-link claim flow | 28 Aug 2026 — no custom Resend template found (`supabase/` has no `templates/` config); this is Supabase's stock email, unbranded. Flagged as a known gap below |
| Founder notification | Make webhook | New fan→player/coach conversion | Founder (Jamal) | One-off per conversion | Live | `app/api/account/convert/route.ts` | 28 Aug 2026 |

## Engagement / retention

| Channel | System | Trigger | Audience | Frequency | Status | Code location | Last verified |
|---|---|---|---|---|---|---|---|
| Email | MailerLite | Weekly coach digest (recommended players) | Coaches, taste-profiled | Weekly (Tue), 6-week rotation rule | Live | `lib/recommendations.ts`, `app/api/cron/coach-recommendations` (Tuesday 08:00 UTC), `sendCoachRecommendationsEmail` (`lib/email.ts`), rotation state in `coach_recommendation_log` table | 28 Aug 2026 |
| In-app | Supabase | Recommended players surfaced on demand | Coaches | On login/session | Live | `app/api/coach/recommendations/route.ts` | 28 Aug 2026 |
| Email | Resend | Drip Day 0 — coach messaged a free player | Free players | Triggered inline, immediate | Live | `sendDripDay0Email`, fired from `app/api/messages/send/route.ts` when a coach messages a free player; also inserts Day 3 + Day 7 rows into `drip_jobs` | 28 Aug 2026 |
| Email | Resend | Drip Day 3 — unread message reminder | Free players, message still unread | 3 days after Day 0 | Live | `sendDripDay3Email`, processed by `app/api/cron/drip-reminders` (daily 09:00 UTC) | 28 Aug 2026 |
| Email + SMS | Resend + Twilio | Drip Day 7 — final reminder | Free players, message still unread | 7 days after Day 0 | Live | `sendDripDay7Email` + SMS (best-effort, `sms_opt_in` checked), `app/api/cron/drip-reminders` | 28 Aug 2026. Sequence aborts early if the player upgrades, opts out (`email_marketing_opt_out`), or reads the triggering message |
| SMS | Twilio | Post-match "log your game" nudge | Players with an active club stint whose likely match day is today, haven't logged | Daily, per-player conditional (SMS-first) | Live | `app/api/cron/log-nudge` (daily 18:00 UTC), match-day inference in `lib/matchDay.ts` (unit tested) | 28 Aug 2026. `sms_opt_in` + 1/day `last_sms_at` cap; email fallback (`sendLogNudgeEmail`) if SMS unavailable. Free feature — no upsell |
| Email | Resend | Weekly player digest | Every approved player | Weekly (Thu 08:00 UTC) | Live | `sendWeeklyDigestEmail`, `app/api/cron/weekly-digest`, body built/validated in `lib/weeklyDigest.ts` | 28 Aug 2026. Respects `email_marketing_opt_out`; unclaimed players (`password_set_at IS NULL`) get a claim-your-account banner instead of stats |
| Email + SMS | Resend + Twilio | Coach nudge — unanswered applications | Coaches with pending applications ≥3 days old on still-active roles | Daily 10:00 UTC, 1 nudge per coach per 5 days | Live | `app/api/cron/application-nudge`, `sendApplicationNudgeEmail`; SMS capped at `MAX_SMS_PER_RUN` (40)/run, falls back to email past the cap; tracked via `profiles.last_application_nudge_at` | 28 Aug 2026. Also carries the opportunity-auto-close pre-warning as an extra line on this SAME send when a coach's role nears `OPP_NEGLECT_WARNING_DAYS` — deliberately never a separate message |

## Transactional / core flow

| Channel | System | Trigger | Audience | Frequency | Status | Code location | Last verified |
|---|---|---|---|---|---|---|---|
| Email + SMS | Resend + Twilio | New message received | Player/Coach (recipient) | Real-time | Live | `app/api/messages/send/route.ts` — `sendMessageNotificationEmail` + SMS (both gated `sms_opt_in` + 1/day cap for SMS) | 28 Aug 2026 |
| Email | Resend | Opportunity application received | Coach | Real-time | Live | `sendApplicationReceivedEmail`, `app/api/applications/apply/route.ts` | 28 Aug 2026 |
| Email | Resend | Application accepted | Player | Real-time, always sent | Live | `sendApplicationDecisionEmail`, `app/api/applications/[id]/route.ts` (PATCH) | 28 Aug 2026. Accepts are asymmetric with declines by design — individual send, actor shown, sent no matter how old the application (good news never goes stale) |
| Email | Resend | Application declined | Player | Capped 1 per player per 24h, only if applied <42 days ago | Live | Same route — `NOTIFY_RESOLUTION_WITHIN_DAYS` (42) in `lib/applicationResponse.ts` gates it | 28 Aug 2026. A decline older than the 42-day window resolves silently — no email, no in-app notification, card just updates |
| Email | Resend | Shortlist available again (status change) | Coaches who shortlisted this player | Capped 1 per coach per player per week | Live | `sendShortlistAvailableEmail`, `app/api/player/status-change/route.ts` | 28 Aug 2026 |
| In-app | Supabase (DB trigger) | Coach shortlists a player | Player | Real-time | Live | `POST /api/coach/shortlist` → `shortlisted` notification type | 28 Aug 2026 |
| In-app | Supabase (DB trigger) | Post liked / commented / marked "interested" | Post author | Real-time | Live | Triggers `trg_notify_post_like`, `trg_notify_post_comment`, `trg_notify_post_interest` — `supabase/migrations/20260427000001_notifications.sql` | 28 Aug 2026 |
| In-app | Supabase (DB trigger) | New application on a coach's opportunity | Coach | Real-time | Live | `trg_notify_new_application` — `supabase/migrations/20260427000002_coach_notifications.sql` | 28 Aug 2026 |
| In-app | Supabase (DB trigger) | Coach shortlists a post / player becomes available on a coach's shortlist | Coach | Real-time | Live | `trg_notify_shortlist_post`, `trg_notify_shortlist_availability`, `trg_notify_viewed_player_free_agent` — `supabase/migrations/20260427000002_coach_notifications.sql`, repaired `20260809000002_repair_coach_notification_triggers.sql` | 28 Aug 2026 |
| In-app | Supabase | Application closed by the platform (no response / role gone) | Player | Weekly sweep + immediate on role closure, max 4/player/run, 1 notification/player/run | Live | `app/api/cron/application-close` (weekly, Mon 11:00 UTC) + `lib/opportunityClosure.ts` (fires immediately on role closure, auto or manual) | 28 Aug 2026. Only for applications within the 42-day window — older closures are silent. NO email, NO SMS — in-app only |
| Email + In-app | Resend + Supabase | Stale/neglected opportunity auto-closed | Coach | Weekly (Mon 11:30 UTC), 1/coach/run listing every role closed | Live | `app/api/cron/opportunity-close`, `sendOpportunityAutoClosedEmail`, `opportunity_auto_closed` notification | 28 Aug 2026. Cascades onto the role's own open applications via `lib/opportunityClosure.ts` |
| In-app | Supabase | Message credit refunded (coach never replied) | Player | Daily, 1/player/run | Live | `app/api/cron/message-credit-refund` (daily 12:00 UTC), `lib/messageCredits.ts` | 28 Aug 2026. NOT retroactive before `REFUND_ELIGIBLE_FROM` (1 Aug 2026), hard floor in the query, no query param can cross it. NO email, NO SMS — in-app only, coach never named |
| — | — | Legacy unused notification types: `profile_view`, `new_opportunity` | — | — | **Dead — enum values exist, nothing writes them** | `notifications` type enum | 28 Aug 2026 |

## Billing / lifecycle

| Channel | System | Trigger | Audience | Frequency | Status | Code location | Last verified |
|---|---|---|---|---|---|---|---|
| Tag | MailerLite | Premium upgrade (adds `player_premium` / `coach_pro` tag) | Player/Coach on upgrade | One-off per upgrade | Live | `onUserUpgradedToPremium` (`lib/mailerlite.ts`), called from `app/api/stripe/webhook/route.ts` (subscription events) and `app/api/stripe/sync/route.ts` (login-time catch-up) | 28 Aug 2026 |
| Email | Resend | Message pack purchase confirmation | Player | One-off per purchase | Live | `sendExtraMessagesPurchaseEmail`, `app/api/stripe/webhook/route.ts` (`checkout.session.completed`, `message_pack` type) | 28 Aug 2026 |
| Email + SMS | Resend + Twilio | Payment failed | Premium subscriber | Conditional, on `invoice.payment_failed` | Live | `sendPaymentFailedEmail` + SMS (`handlePaymentFailedNotifications`), `app/api/stripe/webhook/route.ts` | 28 Aug 2026 |
| Email | Resend | Payment failed — follow-up reminder | Premium subscriber, payment still failed | Conditional | Live | `sendPaymentFailedFollowUpEmail`, `app/api/cron/drip-reminders` | 28 Aug 2026 |
| Email | Resend | Subscription cancelled — win-back | Player/Coach, subscription cancelled | Once per cancellation | Live | `sendSubscriptionCancelledWinBackEmail`, `app/api/cron/drip-reminders` | 4 Sep 2026. Uses `marketingTemplate` (blue hero band, distinct from transactional). Stat block is position-filtered (active roles for the player's position in the last 30 days). Respects `email_marketing_opt_out`. |

## Internal / founder-only (not a customer touchpoint, tracked here for completeness)

| Channel | System | Trigger | Audience | Frequency | Status | Code location | Last verified |
|---|---|---|---|---|---|---|---|
| Telegram | Custom (`lib/telegram.ts`) | Weekly platform metrics report | Founder (Jamal) only | Weekly (Mon 08:00 UTC) | Live | `app/api/cron/weekly-metrics-telegram`, `lib/weeklyReport.ts` | 28 Aug 2026 |

## To fill in (known gaps as of 28 Aug 2026)

- [x] ~~Fan onboarding automation~~ — resolved by product decision, not code: fan signup is closed (12 Aug 2026), so this was dropped rather than built. No action needed unless fan signup reopens.
- [x] Full audit of Twilio SMS triggers — done above. Exactly 6 send sites, all gated on `sms_opt_in` AND the 1-per-recipient-per-day `last_sms_at` cap: `messages/send`, `admin/review`, `cron/application-nudge`, `cron/drip-reminders` (Day 7 only), `cron/log-nudge`, `stripe/webhook` (payment failed). Nothing else sends SMS — in particular, application closures/declines and message credit refunds are deliberately in-app (+ email for opportunity closure) only, so nobody gets texted rejection news.
- [ ] Password reset / auth emails — confirmed **not customised**, still Supabase Auth's stock template (unbranded). Worth a branded Resend template at some point, but functionally live and working.
- [ ] Coach Pro dashboard access confirmation message — no dedicated "you now have Coach Pro" transactional email beyond the generic MailerLite tag add (`coach_pro`); the premium upgrade itself has no confirmation email at all (Stripe's own receipt is the only immediate confirmation the payer sees). Consider whether that's intentional.
