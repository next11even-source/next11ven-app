'use client'

import { useEffect } from 'react'
import Image from 'next/image'

type Props = {
  src: string
  alt: string
  onClose: () => void
}

export default function AvatarLightbox({ src, alt, onClose }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.82)' }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label={`Full size photo of ${alt}`}
    >
      <div
        className="relative"
        style={{ maxWidth: '82vw', maxHeight: '82vh' }}
        onClick={e => e.stopPropagation()}
      >
        <Image
          src={src}
          alt={alt}
          width={600}
          height={600}
          className="rounded-2xl object-cover"
          style={{ maxWidth: '82vw', maxHeight: '82vh', width: 'auto', height: 'auto' }}
          priority
        />
      </div>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 flex items-center justify-center w-9 h-9 rounded-full"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#e8dece', border: '1px solid #2a3150' }}
        aria-label="Close"
      >
        ×
      </button>
    </div>
  )
}
