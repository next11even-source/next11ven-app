'use client'
import Link from 'next/link'

type Crumb = { label: string; href?: string }

export default function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1.5 px-4 py-2.5">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span style={{ color: '#3a4060', fontSize: 12 }}>/</span>
            )}
            {isLast || !crumb.href ? (
              <span
                className="text-xs font-medium"
                style={{ color: isLast ? '#e8dece' : '#8892aa' }}
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-xs font-medium transition-colors"
                style={{ color: '#8892aa', textDecoration: 'none' }}
                onMouseEnter={e => ((e.target as HTMLElement).style.color = '#e8dece')}
                onMouseLeave={e => ((e.target as HTMLElement).style.color = '#8892aa')}
              >
                {crumb.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
