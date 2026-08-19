/**
 * Shared colour/radius constants for the Button and Badge primitives only.
 * Not a repo-wide design-token system — this codebase doesn't have CSS custom
 * properties (globals.css is still the unused create-next-app boilerplate;
 * every component hardcodes hex inline, matching FounderBadge/AgentBadge/
 * NewBadge/ProBadge/Icon convention). This file exists so Button and Badge
 * specifically can't drift from each other the way ad-hoc buttons drifted
 * into five near-duplicate light blues across the app — see the accent audit
 * (19 Aug 2026, CLAUDE.md).
 *
 * accentOnDark (#4d8ae8) is deliberately NOT the same as accent (#2d5fc4):
 * #2d5fc4 is documented as the primary blue and reads fine as a solid button
 * background (white text on top), but fails WCAG AA (3.0-3.3:1) as text
 * sitting directly on a dark or transparent background. #4d8ae8 clears AA on
 * both #0a0a0a and #13172a (5.2-5.8:1) and is already the most common of the
 * drifted values (25 uses across 11 files before this pass), so it becomes
 * the one accent-on-dark colour instead of a fresh unused value.
 */
export const COLORS = {
  text: '#e8dece',
  textMuted: '#8892aa',
  surface: '#13172a',
  border: '#1e2235',

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
} as const

// "--n11-r-sm" in the design brief — 8px, used for chips/inputs/buttons.
export const RADIUS_SM = 8
