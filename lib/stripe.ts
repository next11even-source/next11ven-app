import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
  typescript: true,
})

export const PRICE_IDS = {
  player: process.env.STRIPE_PLAYER_PRICE_ID!,
  coach: process.env.STRIPE_COACH_PRICE_ID!,
} as const

export type PremiumRole = keyof typeof PRICE_IDS
