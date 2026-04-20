export const POSITIONS = ['GK', 'LB', 'RB', 'CB', 'CM', 'RW', 'LW', 'ST', 'Winger'] as const

export type Position = typeof POSITIONS[number]
