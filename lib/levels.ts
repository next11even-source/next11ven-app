export const LEVELS = [
  'Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6', 'Step 7',
  'U18s/Academy', 'Wales 1', 'Wales 2', 'Other',
] as const

export type Level = typeof LEVELS[number]
