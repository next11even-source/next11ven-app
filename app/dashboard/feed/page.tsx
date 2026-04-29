'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import PostCard from './_components/PostCard'
import ComposeModal from './_components/ComposeModal'
import { useSidebar } from '@/app/dashboard/player/_components/SidebarContext'
import type { PostWithAuthor } from '@/types/feed'

const PAGE_SIZE = 25

async function fetchPosts(pageNum: number, viewerId: string): Promise<PostWithAuthor[]> {
  const supabase = createClient()
  const from = pageNum * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data, error } = await supabase
    .from('posts')
    .select(`
      id, author_id, post_type, caption, image_url, created_at,
      author:profiles!author_id(id, full_name, avatar_url, role, position, location),
      post_likes(user_id),
      post_comments(id)
    `)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error || !data) return []

  return (data as any[]).map(p => ({
    id: p.id,
    author_id: p.author_id,
    post_type: p.post_type,
    caption: p.caption,
    image_url: p.image_url,
    created_at: p.created_at,
    author: p.author ?? { id: p.author_id, full_name: null, avatar_url: null, role: null, position: null, location: null },
    likeCount: (p.post_likes ?? []).length,
    hasLiked: (p.post_likes ?? []).some((l: { user_id: string }) => l.user_id === viewerId),
    commentCount: (p.post_comments ?? []).length,
  }))
}

export default function FeedPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<PostWithAuthor[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userPremium, setUserPremium] = useState(false)
  const [showCompose, setShowCompose] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, premium')
        .eq('id', user.id)
        .single()

      const role = profile?.role ?? 'player'
      setUserId(user.id)
      setUserRole(role)
      setUserPremium(profile?.premium ?? false)

      const initial = await fetchPosts(0, user.id)
      setPosts(initial)
      setHasMore(initial.length === PAGE_SIZE)
      setLoading(false)
    })
  }, [router])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !userId) return
    setLoadingMore(true)
    const nextPage = page + 1
    const more = await fetchPosts(nextPage, userId)
    setPosts(prev => [...prev, ...more])
    setPage(nextPage)
    setHasMore(more.length === PAGE_SIZE)
    setLoadingMore(false)
  }, [loadingMore, hasMore, userId, page])

  function onPostCreated(newPost: PostWithAuthor) {
    setPosts(prev => [newPost, ...prev])
    setShowCompose(false)
  }

  function onPostDeleted(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  const canPost = userRole === 'player' || userRole === 'coach' || userRole === 'admin'
  const { openSidebar } = useSidebar()

  if (loading) {
    return (
      <div style={{ backgroundColor: '#0a0a0a', minHeight: '100vh' }}>
        <div style={{ height: 57, borderBottom: '1px solid #1e2235', backgroundColor: 'rgba(10,10,10,0.95)' }} />
        <div className="px-4 pt-4 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl animate-pulse" style={{ backgroundColor: '#13172a', height: 220 }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: '#0a0a0a', minHeight: '100vh' }}>
      {/* Sticky header */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: 'rgba(10,10,10,0.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}
      >
        <div className="flex items-center gap-3">
          <button onClick={openSidebar} className="flex-shrink-0 p-1 -ml-1" style={{ color: '#8892aa' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: '#e8dece', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Community
          </h1>
        </div>
        {canPost && (
          <button
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: '#f59e0b', color: '#0a0a0a', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em', textTransform: 'uppercase' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Post
          </button>
        )}
      </div>

      {/* Intro banner */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl px-4 py-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 700, color: '#e8dece', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            New Feature 🔥
          </p>
          <p className="text-sm leading-relaxed" style={{ color: '#8892aa', fontFamily: "'Inter', sans-serif" }}>
            Share what you're doing on the pitch. Post a season review, let clubs know you're available, drop a highlight, or just talk football.
          </p>
        </div>
      </div>

      {/* Feed */}
      <div className="px-4 pt-4 pb-6 space-y-4">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4" style={{ opacity: 0.3 }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="4" rx="1" /><rect x="3" y="10" width="7" height="4" rx="1" /><rect x="3" y="17" width="7" height="4" rx="1" />
                <line x1="14" y1="5" x2="21" y2="5" /><line x1="14" y1="12" x2="21" y2="12" /><line x1="14" y1="19" x2="21" y2="19" />
              </svg>
            </div>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color: '#e8dece', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Nothing here yet
            </p>
            <p className="mt-2 text-sm max-w-xs" style={{ color: '#8892aa', fontFamily: "'Inter', sans-serif" }}>
              Be the first to post. Let coaches know what you can do.
            </p>
            {canPost && (
              <button
                onClick={() => setShowCompose(true)}
                className="mt-5 px-6 py-3 rounded-xl font-bold"
                style={{ backgroundColor: '#f59e0b', color: '#0a0a0a', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, letterSpacing: '0.04em', textTransform: 'uppercase' }}
              >
                Create a Post
              </button>
            )}
          </div>
        ) : (
          <>
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                viewerId={userId!}
                viewerRole={userRole!}
                onDelete={onPostDeleted}
              />
            ))}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: loadingMore ? '#4b5563' : '#8892aa', fontFamily: "'Inter', sans-serif" }}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>

      {showCompose && userId && (
        <ComposeModal
          userId={userId}
          onClose={() => setShowCompose(false)}
          onPost={onPostCreated}
        />
      )}
    </div>
  )
}
