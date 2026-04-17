'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function MarketRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'activity') {
      router.replace('/dashboard/player/activity')
    } else if (tab === 'messages') {
      router.replace('/dashboard/player/messages')
    } else {
      // opportunities, applications, or no tab
      router.replace('/dashboard/player/opportunities')
    }
  }, [])

  return null
}

export default function MarketPage() {
  return (
    <Suspense>
      <MarketRedirect />
    </Suspense>
  )
}
