export type PostType = 'highlight' | 'looking_for_club' | 'season_review' | 'general'

export type PostAuthor = {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string | null
  position: string | null
  location: string | null
  is_agent: boolean | null
}

export type PostWithAuthor = {
  id: string
  author_id: string
  post_type: PostType
  caption: string | null
  image_url: string | null
  created_at: string
  author: PostAuthor
  likeCount: number
  hasLiked: boolean
  commentCount: number
}

export type PostComment = {
  id: string
  post_id: string
  author_id: string
  content: string
  created_at: string
  author: {
    full_name: string | null
    avatar_url: string | null
  } | null
}

export type PostLike = {
  id: string
  post_id: string
  user_id: string
  created_at: string
}
