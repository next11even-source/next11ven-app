/**
 * Shared colour/radius constants for the design-system primitives (Button,
 * Badge, Card, ListRow). Not a repo-wide design-token system — this codebase
 * doesn't have CSS custom properties (globals.css is still the unused
 * create-next-app boilerplate; every component hardcodes hex inline,
 * matching FounderBadge/AgentBadge/NewBadge/ProBadge/Icon convention). This
 * file exists so the primitives can't drift from each other the way ad-hoc
 * buttons drifted into five near-duplicate light blues across the app — see
 * the accent audit (19 Aug 2026, CLAUDE.md).
 *
 * accentOnDark (#4d8ae8) is deliberately NOT the same as accent (#2d5fc4):
 * #2d5fc4 is documented as the primary blue and reads fine as a solid button
 * background (white text on top), but fails WCAG AA (3.0-3.3:1) as text
 * sitting directly on a dark or transparent background. #4d8ae8 clears AA on
 * both #0a0a0a and #13172a (5.2-5.8:1) and is already the most common of the
 * drifted values (25 uses across 11 files before this pass), so it becomes
 * the one accent-on-dark colour instead of a fresh unused value.
 *
 * surface2/textMuted2/borderStrong added for Card/ListRow (Session 4, 22 Aug
 * 2026) — the two-step surface/text ramp those primitives need (base vs.
 * hover-raised, body text vs. de-emphasised subtitle text) that didn't exist
 * when this file only served flat-coloured Button/Badge.
 */
export const COLORS = {
  text: '#e8dece',
  textMuted: '#8892aa',
  // One step down from textMuted — subtitle/meta text on Card and ListRow
  // (club · region, timestamps) that needs to sit quieter than textMuted's
  // existing uses (badge labels, nav) without dropping to near-invisible.
  textMuted2: '#5b6478',
  surface: '#13172a',
  // Hover-raised surface for Card's `interactive` state — one step up from
  // `surface`, matches the `#1a1f3a` hover tint already used ad-hoc on
  // avatar containers and list-row hovers across the app.
  surface2: '#1a1f3a',
  border: '#1e2235',
  // Hover-raised border for Card's `interactive` state, paired with surface2.
  borderStrong: '#2a3150',

  accent: '#2d5fc4',
  accentHover: '#3a6fda',
  accentOnDark: '#4d8ae8',
  accentBg: 'rgba(45,95,196,0.1)',
  onAccent: '#ffffff',

  pro: '#4d8ae8',
  proBg: 'rgba(45,95,196,0.14)',
  urgent: '#f59e0b',
  urgentBg: 'rgba(245,158,11,0.12)',
  available: '#22c55e',
  availableBg: 'rgba(34,197,94,0.12)',

  // Coach-identity purple — undocumented in CLAUDE.md but consistently used
  // for coach initials/avatars across ~15 files before this pass. Kept as-is
  // per founder direction (Session 4 pre-flight), centralised here so it
  // can't re-drift the way the blues did.
  coachIdentity: '#a78bfa',

  // One-off promotional marker — "New Feature" callouts only, e.g. the Coach
  // Pro Dashboard ribbon on the coach homepage (Session, 22 Aug 2026).
  // Deliberately its own token, not a reuse of `urgent`: urgent means "this
  // needs your attention/action," spotlight means "here's something new we
  // built" — visually adjacent ambers, but conflating the two would make a
  // marketing callout read as if something needs the coach's attention.
  // Genuinely rare — reach for `accent` or `urgent` first; only use this for
  // a real one-off promotional ribbon, not a second "new" or "urgent" tone.
  spotlight: '#facc15',
  spotlightBg: 'rgba(250,204,21,0.14)',
} as const

// "--n11-r-sm" in the design brief — 8px, used for chips/inputs/buttons.
export const RADIUS_SM = 8
// "--n11-r-md" in the design brief — 12px, used for Card.
export const RADIUS_MD = 12
// "--n11-r-full" in the design brief — fully rounded, used for avatar containers.
export const RADIUS_FULL = 9999
