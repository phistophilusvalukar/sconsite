import React, { FormEvent, SyntheticEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Calendar,
  CheckCircle,
  Edit3,
  Eye,
  Heart,
  MessageCircle,
  Newspaper,
  Plus,
  Save,
  Send,
  Tag,
  Trash2,
  User,
  Users,
  XCircle
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { DATABASE_TABLES } from '../config/database';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import NewsService, { SaveNewsPostInput } from '../services/newsService';
import { NewsCategory, NewsPost, NewsPostStatus } from '../types/database';

const categories: Array<'All' | NewsCategory> = ['All', 'Announcements', 'Events', 'Updates', 'Community'];
const commonTags = ['Campaign', 'Major Event', 'All Guilds', 'Update', 'Features', 'Spotlight', 'Festival', 'Downtime', 'Recap'];

const emptyEditor = {
  title: '',
  summary: '',
  body: '',
  category: 'Announcements' as NewsCategory,
  tagsText: '',
  imageUrl: '/npc-placeholder.png',
  status: 'draft' as NewsPostStatus
};

const NewsPage: React.FC = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, login } = useAuth();
  const newsService = useMemo(() => NewsService.getInstance(), []);
  const isAdmin = Boolean(user?.isAdmin || user?.profile?.isAdmin);

  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<'All' | NewsCategory>('All');
  const [selectedTag, setSelectedTag] = useState('All');
  const [editor, setEditor] = useState(emptyEditor);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPost = slug ? posts.find(post => post.slug === slug) : undefined;
  const publishedPosts = posts.filter(post => post.status === 'published');
  const draftPosts = posts.filter(post => post.status === 'draft');
  const visiblePosts = posts.filter(post => isAdmin || post.status === 'published');
  const allTags = useMemo(() => Array.from(new Set(visiblePosts.flatMap(post => post.tags))).sort(), [visiblePosts]);
  const filteredPosts = visiblePosts.filter(post => {
    const categoryMatches = selectedCategory === 'All' || post.category === selectedCategory;
    const tagMatches = selectedTag === 'All' || post.tags.includes(selectedTag);
    return categoryMatches && tagMatches;
  });

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await newsService.getPosts(user?.id, isAdmin);
    if (result.success && result.data) {
      setPosts(result.data);
    } else {
      setError(result.error || 'Failed to load news posts.');
    }
    setIsLoading(false);
  }, [isAdmin, newsService, user?.id]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useSupabaseRealtime({
    channelName: `news-page-${user?.id || 'anonymous'}-${isAdmin ? 'admin' : 'public'}`,
    tables: [
      DATABASE_TABLES.NEWS_POSTS,
      DATABASE_TABLES.NEWS_COMMENTS,
      DATABASE_TABLES.NEWS_LIKES
    ],
    onChange: loadPosts
  });

  useEffect(() => {
    if (!slug || isLoading || selectedPost) return;
    setError('That news post could not be found or is not published yet.');
  }, [slug, isLoading, selectedPost]);

  const handleSavePost = async (event: SyntheticEvent, nextStatus: NewsPostStatus = editor.status) => {
    event.preventDefault();
    if (!user?.id || !isAdmin) return;

    if (!editor.title.trim() || !editor.summary.trim() || !editor.body.trim()) {
      setError('Title, summary, and body are required.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const input: SaveNewsPostInput = {
      authorId: user.id,
      authorName: user.username,
      title: editor.title,
      summary: editor.summary,
      body: editor.body,
      category: editor.category,
      tags: parseTags(editor.tagsText),
      status: nextStatus,
      imageUrl: editor.imageUrl
    };

    const result = editingPostId
      ? await newsService.updatePost(editingPostId, input)
      : await newsService.createPost(input);

    if (result.success) {
      await loadPosts();
      setEditor(emptyEditor);
      setEditingPostId(null);
      setShowEditor(false);
    } else {
      setError(result.error || 'Failed to save post.');
    }

    setIsSaving(false);
  };

  const startEditing = (post: NewsPost) => {
    setEditor({
      title: post.title,
      summary: post.summary,
      body: post.body,
      category: post.category,
      tagsText: post.tags.join(', '),
      imageUrl: post.imageUrl,
      status: post.status
    });
    setEditingPostId(post._id || null);
    setShowEditor(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeletePost = async (post: NewsPost) => {
    if (!post._id || !isAdmin || !window.confirm(`Delete "${post.title}"?`)) return;
    const result = await newsService.deletePost(post._id);
    if (result.success) {
      if (slug === post.slug) navigate('/news');
      await loadPosts();
    } else {
      setError(result.error || 'Failed to delete post.');
    }
  };

  const handleToggleLike = async (post: NewsPost) => {
    if (!post._id) return;
    if (!isAuthenticated || !user?.id) {
      await login();
      return;
    }

    const result = await newsService.toggleLike(post._id, user.id, post.likedByCurrentUser);
    if (result.success) {
      await loadPosts();
    } else {
      setError(result.error || 'Failed to update like.');
    }
  };

  const handleAddComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPost?._id) return;
    if (!isAuthenticated || !user?.id) {
      await login();
      return;
    }

    const body = commentBody.trim();
    if (!body) return;

    const result = await newsService.addComment(selectedPost._id, user.id, user.username, body);
    if (result.success) {
      setCommentBody('');
      await loadPosts();
    } else {
      setError(result.error || 'Failed to add comment.');
    }
  };

  const handleDeleteComment = async (commentId?: string) => {
    if (!commentId) return;
    const result = await newsService.deleteComment(commentId);
    if (result.success) {
      await loadPosts();
    } else {
      setError(result.error || 'Failed to delete comment.');
    }
  };

  if (slug) {
    return (
      <NewsShell
        isLoading={isLoading}
        error={error}
        isAdmin={isAdmin}
        onNewPost={() => setShowEditor(true)}
        editor={showEditor ? (
          <NewsEditor
            editor={editor}
            editingPostId={editingPostId}
            isSaving={isSaving}
            onChange={setEditor}
            onSubmit={handleSavePost}
            onCancel={() => {
              setShowEditor(false);
              setEditingPostId(null);
              setEditor(emptyEditor);
            }}
          />
        ) : null}
      >
        {selectedPost ? (
          <PostDetail
            post={selectedPost}
            isAdmin={isAdmin}
            currentUserId={user?.id}
            commentBody={commentBody}
            isAuthenticated={isAuthenticated}
            onCommentBodyChange={setCommentBody}
            onAddComment={handleAddComment}
            onToggleLike={handleToggleLike}
            onEdit={startEditing}
            onDelete={handleDeletePost}
            onDeleteComment={handleDeleteComment}
            onLogin={login}
          />
        ) : !isLoading ? (
          <EmptyState title="Post unavailable" body="This post is still drafted, unpublished, or no longer exists." />
        ) : null}
      </NewsShell>
    );
  }

  return (
    <NewsShell
      isLoading={isLoading}
      error={error}
      isAdmin={isAdmin}
      onNewPost={() => setShowEditor(true)}
      editor={showEditor ? (
        <NewsEditor
          editor={editor}
          editingPostId={editingPostId}
          isSaving={isSaving}
          onChange={setEditor}
          onSubmit={handleSavePost}
          onCancel={() => {
            setShowEditor(false);
            setEditingPostId(null);
            setEditor(emptyEditor);
          }}
        />
      ) : null}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div>
          <div className="mb-6 flex flex-wrap gap-3">
            {categories.map(category => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
                  selectedCategory === category
                    ? 'bg-yellow-500 text-midnight-900'
                    : 'bg-fantasy-800/60 text-gray-300 hover:bg-fantasy-700/70 hover:text-white'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {allTags.length > 0 && (
            <div className="mb-8 flex flex-wrap gap-2">
              {['All', ...allTags].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag)}
                  className={`inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-bold transition-all ${
                    selectedTag === tag
                      ? 'bg-fantasy-200 text-midnight-900'
                      : 'bg-fantasy-900/50 text-yellow-300 ring-1 ring-fantasy-700/40 hover:bg-fantasy-800'
                  }`}
                >
                  <Tag className="h-3 w-3" />
                  {tag}
                </button>
              ))}
            </div>
          )}

          {filteredPosts.length > 0 ? (
            <>
              <FeaturedPost post={filteredPosts[0]} onToggleLike={handleToggleLike} />
              <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
                {filteredPosts.slice(1).map(post => (
                  <PostCard key={post._id} post={post} onToggleLike={handleToggleLike} />
                ))}
              </div>
            </>
          ) : !isLoading ? (
            <EmptyState title="No posts yet" body="Published news will appear here once the staff posts an announcement, event, update, or community story." />
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-fantasy-700/30 bg-fantasy-900/30 p-5">
            <h2 className="mb-3 font-fantasy text-xl font-bold text-white">News Desk</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Published" value={publishedPosts.length} />
              <Stat label="Drafts" value={isAdmin ? draftPosts.length : 0} />
              <Stat label="Comments" value={publishedPosts.reduce((sum, post) => sum + post.comments.length, 0)} />
              <Stat label="Likes" value={publishedPosts.reduce((sum, post) => sum + post.likeCount, 0)} />
            </div>
          </div>

          {isAdmin && draftPosts.length > 0 && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-950/20 p-5">
              <h2 className="mb-3 font-fantasy text-xl font-bold text-white">Drafts</h2>
              <div className="space-y-3">
                {draftPosts.map(post => (
                  <button
                    key={post._id}
                    type="button"
                    onClick={() => startEditing(post)}
                    className="block w-full rounded-lg bg-fantasy-900/60 p-3 text-left hover:bg-fantasy-800/80"
                  >
                    <span className="block text-sm font-bold text-white">{post.title}</span>
                    <span className="text-xs text-gray-400">Updated {formatDate(post.updatedAt)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-fantasy-700/30 bg-fantasy-900/30 p-5">
            <h2 className="mb-3 font-fantasy text-xl font-bold text-white">Common Tags</h2>
            <div className="flex flex-wrap gap-2">
              {commonTags.map(tag => (
                <span key={tag} className="rounded bg-fantasy-800/70 px-2 py-1 text-xs font-bold text-yellow-300">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </NewsShell>
  );
};

interface NewsShellProps {
  children: React.ReactNode;
  editor: React.ReactNode;
  error: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  onNewPost: () => void;
}

const NewsShell: React.FC<NewsShellProps> = ({ children, editor, error, isAdmin, isLoading, onNewPost }) => (
  <div className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <Newspaper className="mb-5 h-14 w-14 text-yellow-400" />
          <h1 className="font-fantasy text-4xl font-bold text-white md:text-6xl">News & Events</h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-300">
            Announcements, events, campaign updates, and community dispatches from the Scon table.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={onNewPost}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-yellow-500 px-5 py-3 font-bold text-midnight-900 transition-all hover:bg-yellow-400"
          >
            <Plus className="h-5 w-5" />
            New Post
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-400/30 bg-red-950/40 p-4 text-red-200">
          {error}
        </div>
      )}

      {editor}

      {isLoading ? (
        <div className="rounded-xl border border-fantasy-700/30 bg-fantasy-900/30 p-8 text-center text-gray-300">
          Loading news...
        </div>
      ) : children}
    </div>
  </div>
);

interface NewsEditorProps {
  editor: typeof emptyEditor;
  editingPostId: string | null;
  isSaving: boolean;
  onChange: (nextEditor: typeof emptyEditor) => void;
  onSubmit: (event: SyntheticEvent, nextStatus?: NewsPostStatus) => void;
  onCancel: () => void;
}

const NewsEditor: React.FC<NewsEditorProps> = ({ editor, editingPostId, isSaving, onChange, onSubmit, onCancel }) => (
  <form onSubmit={(event) => onSubmit(event, editor.status)} className="mb-10 rounded-xl border border-yellow-400/20 bg-fantasy-900/50 p-5">
    <div className="mb-5 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-yellow-300">Admin CMS</p>
        <h2 className="font-fantasy text-2xl font-bold text-white">{editingPostId ? 'Edit Post' : 'Create Post'}</h2>
      </div>
      <button type="button" onClick={onCancel} className="rounded-lg p-2 text-gray-300 hover:bg-fantasy-800 hover:text-white" aria-label="Close editor">
        <XCircle className="h-5 w-5" />
      </button>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-gray-300">Title</span>
        <input value={editor.title} onChange={(event) => onChange({ ...editor, title: event.target.value })} className="w-full rounded-lg border border-fantasy-700/40 bg-fantasy-950/50 p-3 text-white" />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-gray-300">Category</span>
        <select value={editor.category} onChange={(event) => onChange({ ...editor, category: event.target.value as NewsCategory })} className="w-full rounded-lg border border-fantasy-700/40 bg-fantasy-950/50 p-3 text-white">
          {categories.filter(category => category !== 'All').map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label className="block md:col-span-2">
        <span className="mb-2 block text-sm font-bold text-gray-300">Summary</span>
        <textarea value={editor.summary} onChange={(event) => onChange({ ...editor, summary: event.target.value })} rows={2} className="w-full rounded-lg border border-fantasy-700/40 bg-fantasy-950/50 p-3 text-white" />
      </label>
      <label className="block md:col-span-2">
        <span className="mb-2 block text-sm font-bold text-gray-300">Full Body</span>
        <textarea value={editor.body} onChange={(event) => onChange({ ...editor, body: event.target.value })} rows={8} className="w-full rounded-lg border border-fantasy-700/40 bg-fantasy-950/50 p-3 text-white" />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-gray-300">Minor Tags</span>
        <input value={editor.tagsText} onChange={(event) => onChange({ ...editor, tagsText: event.target.value })} placeholder="Campaign, Major Event, All Guilds" className="w-full rounded-lg border border-fantasy-700/40 bg-fantasy-950/50 p-3 text-white placeholder-gray-500" />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-bold text-gray-300">Image URL</span>
        <input value={editor.imageUrl} onChange={(event) => onChange({ ...editor, imageUrl: event.target.value })} className="w-full rounded-lg border border-fantasy-700/40 bg-fantasy-950/50 p-3 text-white" />
      </label>
    </div>

    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        disabled={isSaving}
        onClick={(event) => onSubmit(event, 'draft')}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-fantasy-700 px-5 py-3 font-bold text-white hover:bg-fantasy-600 disabled:opacity-60"
      >
        <Save className="h-4 w-4" />
        Save Draft
      </button>
      <button
        type="button"
        disabled={isSaving}
        onClick={(event) => onSubmit(event, 'published')}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-yellow-500 px-5 py-3 font-bold text-midnight-900 hover:bg-yellow-400 disabled:opacity-60"
      >
        <CheckCircle className="h-4 w-4" />
        Publish
      </button>
    </div>
  </form>
);

const FeaturedPost: React.FC<{ post: NewsPost; onToggleLike: (post: NewsPost) => void }> = ({ post, onToggleLike }) => (
  <article className="overflow-hidden rounded-xl border border-fantasy-700/30 bg-fantasy-900/30 transition-all hover:bg-fantasy-800/30">
    <div className="md:flex">
      <Link to={`/news/${post.slug}`} className="block md:w-1/3">
        <img src={post.imageUrl} alt={post.title} className="h-56 w-full object-cover md:h-full" />
      </Link>
      <div className="p-6 md:w-2/3">
        <PostMeta post={post} />
        <Link to={`/news/${post.slug}`} className="group">
          <h2 className="mt-4 font-fantasy text-3xl font-bold text-white transition-colors group-hover:text-yellow-400">{post.title}</h2>
          <p className="mt-4 text-gray-300">{post.summary}</p>
        </Link>
        <PostTags post={post} />
        <PostActions post={post} onToggleLike={onToggleLike} />
      </div>
    </div>
  </article>
);

const PostCard: React.FC<{ post: NewsPost; onToggleLike: (post: NewsPost) => void }> = ({ post, onToggleLike }) => (
  <article className="overflow-hidden rounded-xl border border-fantasy-700/30 bg-fantasy-900/30 transition-all hover:bg-fantasy-800/30">
    <Link to={`/news/${post.slug}`} className="group block">
      <img src={post.imageUrl} alt={post.title} className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-105" />
      <div className="p-5">
        <PostMeta post={post} compact />
        <h2 className="mt-3 text-xl font-bold text-white transition-colors group-hover:text-yellow-400">{post.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-300">{post.summary}</p>
      </div>
    </Link>
    <div className="px-5 pb-5">
      <PostTags post={post} limit={3} />
      <PostActions post={post} onToggleLike={onToggleLike} compact />
    </div>
  </article>
);

interface PostDetailProps {
  post: NewsPost;
  isAdmin: boolean;
  currentUserId?: string;
  commentBody: string;
  isAuthenticated: boolean;
  onCommentBodyChange: (body: string) => void;
  onAddComment: (event: FormEvent) => void;
  onToggleLike: (post: NewsPost) => void;
  onEdit: (post: NewsPost) => void;
  onDelete: (post: NewsPost) => void;
  onDeleteComment: (commentId?: string) => void;
  onLogin: () => Promise<void>;
}

const PostDetail: React.FC<PostDetailProps> = ({
  post,
  isAdmin,
  currentUserId,
  commentBody,
  isAuthenticated,
  onCommentBodyChange,
  onAddComment,
  onToggleLike,
  onEdit,
  onDelete,
  onDeleteComment,
  onLogin
}) => (
  <article className="mx-auto max-w-4xl">
    <Link to="/news" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-yellow-300 hover:text-yellow-200">
      Back to news
    </Link>
    <img src={post.imageUrl} alt={post.title} className="mb-6 h-72 w-full rounded-xl object-cover" />
    <PostMeta post={post} />
    {post.status === 'draft' && <p className="mt-4 inline-flex rounded bg-amber-500/20 px-3 py-1 text-sm font-bold text-amber-200">Draft</p>}
    <h1 className="mt-4 font-fantasy text-4xl font-bold text-white md:text-5xl">{post.title}</h1>
    <p className="mt-5 text-xl leading-relaxed text-gray-300">{post.summary}</p>
    <PostTags post={post} />
    <div className="mt-8 whitespace-pre-wrap rounded-xl border border-fantasy-700/30 bg-fantasy-900/30 p-6 text-lg leading-8 text-gray-100">
      {post.body}
    </div>

    <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
      <PostActions post={post} onToggleLike={onToggleLike} />
      {isAdmin && (
        <div className="flex gap-2">
          <button type="button" onClick={() => onEdit(post)} className="inline-flex items-center gap-2 rounded-lg bg-fantasy-700 px-4 py-2 font-bold text-white hover:bg-fantasy-600">
            <Edit3 className="h-4 w-4" />
            Edit
          </button>
          <button type="button" onClick={() => onDelete(post)} className="inline-flex items-center gap-2 rounded-lg bg-red-900/60 px-4 py-2 font-bold text-red-100 hover:bg-red-800">
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}
    </div>

    <section className="mt-10 rounded-xl border border-fantasy-700/30 bg-fantasy-900/30 p-5">
      <h2 className="mb-4 font-fantasy text-2xl font-bold text-white">Comments</h2>
      {isAuthenticated ? (
        <form onSubmit={onAddComment} className="mb-6 flex flex-col gap-3">
          <textarea value={commentBody} onChange={(event) => onCommentBodyChange(event.target.value)} rows={3} placeholder="Add a comment" className="w-full rounded-lg border border-fantasy-700/40 bg-fantasy-950/50 p-3 text-white placeholder-gray-500" />
          <button type="submit" className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-yellow-500 px-4 py-2 font-bold text-midnight-900 hover:bg-yellow-400">
            <Send className="h-4 w-4" />
            Comment
          </button>
        </form>
      ) : (
        <button type="button" onClick={onLogin} className="mb-6 rounded-lg bg-yellow-500 px-4 py-2 font-bold text-midnight-900 hover:bg-yellow-400">
          Sign in to comment
        </button>
      )}

      <div className="space-y-3">
        {post.comments.map(comment => {
          const canDelete = isAdmin || comment.authorId === currentUserId;
          return (
            <div key={comment._id} className="rounded-lg bg-fantasy-950/40 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-bold text-white">{comment.authorName}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{formatDate(comment.createdAt)}{comment.isEdited ? ' edited' : ''}</span>
                  {canDelete && (
                    <button type="button" onClick={() => onDeleteComment(comment._id)} className="text-red-300 hover:text-red-200">
                      Delete
                    </button>
                  )}
                </div>
              </div>
              <p className="whitespace-pre-wrap text-gray-300">{comment.body}</p>
            </div>
          );
        })}
        {post.comments.length === 0 && <p className="text-gray-400">No comments yet.</p>}
      </div>
    </section>
  </article>
);

const PostMeta: React.FC<{ post: NewsPost; compact?: boolean }> = ({ post, compact = false }) => (
  <div className={`flex flex-wrap items-center gap-3 ${compact ? 'text-xs' : 'text-sm'}`}>
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-bold ${categoryTone(post.category)}`}>
      {categoryIcon(post.category)}
      {post.category}
    </span>
    <span className="inline-flex items-center gap-1 text-gray-400">
      <User className="h-4 w-4" />
      {post.authorName}
    </span>
    <span className="inline-flex items-center gap-1 text-gray-400">
      <Calendar className="h-4 w-4" />
      {formatDate(post.publishedAt || post.createdAt)}
    </span>
    {post.status === 'draft' && (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1 font-bold text-amber-200">
        <Eye className="h-4 w-4" />
        Draft
      </span>
    )}
  </div>
);

const PostTags: React.FC<{ post: NewsPost; limit?: number }> = ({ post, limit }) => {
  const tags = limit ? post.tags.slice(0, limit) : post.tags;
  if (tags.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {tags.map(tag => (
        <span key={tag} className="inline-flex items-center gap-1 rounded bg-fantasy-800/70 px-2 py-1 text-xs font-bold text-yellow-300">
          <Tag className="h-3 w-3" />
          {tag}
        </span>
      ))}
    </div>
  );
};

const PostActions: React.FC<{ post: NewsPost; compact?: boolean; onToggleLike: (post: NewsPost) => void }> = ({ post, compact = false, onToggleLike }) => (
  <div className={`mt-5 flex items-center gap-5 ${compact ? 'text-sm' : ''}`}>
    <button type="button" onClick={() => onToggleLike(post)} className={`inline-flex items-center gap-2 transition-colors ${post.likedByCurrentUser ? 'text-red-300' : 'text-gray-400 hover:text-red-300'}`}>
      <Heart className={`h-5 w-5 ${post.likedByCurrentUser ? 'fill-current' : ''}`} />
      {post.likeCount}
    </button>
    <Link to={`/news/${post.slug}`} className="inline-flex items-center gap-2 text-gray-400 hover:text-blue-300">
      <MessageCircle className="h-5 w-5" />
      {post.comments.length}
    </Link>
  </div>
);

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-lg bg-fantasy-950/40 p-3">
    <p className="text-2xl font-bold text-white">{value}</p>
    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{label}</p>
  </div>
);

const EmptyState: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="rounded-xl border border-fantasy-700/30 bg-fantasy-900/30 p-8 text-center">
    <Newspaper className="mx-auto mb-4 h-10 w-10 text-yellow-400" />
    <h2 className="font-fantasy text-2xl font-bold text-white">{title}</h2>
    <p className="mt-2 text-gray-300">{body}</p>
  </div>
);

const parseTags = (tagsText: string) => tagsText.split(',').map(tag => tag.trim()).filter(Boolean);

const formatDate = (date: Date) => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
}).format(date);

const categoryTone = (category: NewsCategory) => {
  switch (category) {
    case 'Announcements': return 'bg-red-400/20 text-red-200';
    case 'Events': return 'bg-purple-400/20 text-purple-200';
    case 'Updates': return 'bg-blue-400/20 text-blue-200';
    case 'Community': return 'bg-green-400/20 text-green-200';
    default: return 'bg-gray-400/20 text-gray-200';
  }
};

const categoryIcon = (category: NewsCategory) => {
  switch (category) {
    case 'Events': return <Calendar className="h-4 w-4" />;
    case 'Community': return <Users className="h-4 w-4" />;
    default: return <Newspaper className="h-4 w-4" />;
  }
};

export default NewsPage;
