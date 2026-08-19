import React, { useEffect, useState } from 'react';
import { getPosts, updatePost, deletePost, getBrandById, Brand, getSafeDate } from '../dbAdapter';
import { auth } from '../auth';
import { BrandSelector } from '../components/BrandSelector';
import { 
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, 
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday 
} from 'date-fns';
import { 
  Calendar as CalendarIcon, Clock, Trash2, Image as ImageIcon, Video, 
  Type as TypeIcon, CheckCircle2, Send, Eye, ChevronLeft, ChevronRight, LayoutGrid, List, Plus
} from 'lucide-react';
import { publishPostToPlatforms } from '../services/socialPostingService';
import { PostPreviewModal } from '../components/PostPreviewModal';
import { useNavigate } from 'react-router-dom';

export function Scheduler() {
  const [posts, setPosts] = useState<any[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState<string>(localStorage.getItem('activeBrandId') || '');

  // View Mode & Navigation
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  
  // Preview Modal State
  const [previewPost, setPreviewPost] = useState<any | null>(null);

  const navigate = useNavigate();

  const loadBrandPosts = async (brandId?: string) => {
    setLoading(true);
    try {
      if (brandId) {
        const b = await getBrandById(brandId);
        setBrand(b);
      }
      const postsData = await getPosts(brandId || undefined);
      setPosts(postsData);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrandPosts(selectedBrandId);
  }, [selectedBrandId]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    try {
      await deletePost(id);
      setPosts(posts.filter(p => p.id !== id));
    } catch (error) {
      console.error("Error deleting post:", error);
      alert("Failed to delete post.");
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await updatePost(id, { status: 'scheduled' });
      setPosts(posts.map(p => p.id === id ? { ...p, status: 'scheduled' } : p));
      alert("Post approved and scheduled!");
    } catch (error) {
      console.error("Error approving post:", error);
      alert("Failed to approve post.");
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await updatePost(id, { content: editingContent });
      setPosts(posts.map(p => p.id === id ? { ...p, content: editingContent } : p));
      setEditingPostId(null);
      alert("Post updated successfully!");
    } catch (error) {
      console.error("Error updating post:", error);
      alert("Failed to update post.");
    }
  };

  // Calendar Grid Calculations
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Start Monday
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  if (loading) return <div className="p-8 font-sans text-gray-500">Loading Content Schedule...</div>;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Content Schedule Calendar</h1>
          <p className="text-gray-500 mt-1">Review, approve, preview, and manage scheduled posts across all your connected social accounts.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* View Switcher */}
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'calendar' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Calendar Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === 'list' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              List View ({posts.length})
            </button>
          </div>

          <BrandSelector
            activeBrandId={selectedBrandId}
            onBrandChange={(selected) => {
              setSelectedBrandId(selected.id);
              localStorage.setItem('activeBrandId', selected.id);
            }}
          />
        </div>
      </header>

      {/* Main Content Area */}
      {viewMode === 'calendar' ? (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden space-y-4 p-6">
          {/* Calendar Header Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">{format(currentMonth, 'MMMM yyyy')}</h2>
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200">
                <button
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-1 text-gray-600 hover:text-black rounded hover:bg-white transition-all"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date())}
                  className="px-2.5 py-0.5 text-xs font-bold text-gray-700 hover:text-black rounded hover:bg-white transition-all"
                >
                  Today
                </button>
                <button
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-1 text-gray-600 hover:text-black rounded hover:bg-white transition-all"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Scheduled ({posts.filter(p => p.status === 'scheduled').length})</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Awaiting Approval ({posts.filter(p => p.status === 'suggested').length})</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Published ({posts.filter(p => p.status === 'published').length})</span>
            </div>
          </div>

          {/* Calendar Weekday Names */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden text-center text-xs font-bold uppercase tracking-wider text-gray-500">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="bg-gray-50 py-2.5">{day}</div>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden">
            {calendarDays.map((day, idx) => {
              const dayPosts = posts.filter(p => {
                const pDate = getSafeDate(p.scheduledTime || p.scheduled_time || p.created_at);
                return isSameDay(pDate, day);
              });
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isDayToday = isToday(day);

              return (
                <div 
                  key={idx} 
                  className={`min-h-[120px] p-2 bg-white flex flex-col justify-between transition-colors ${
                    !isCurrentMonth ? 'bg-gray-50/50 text-gray-400' : 'text-gray-900'
                  } ${isDayToday ? 'bg-blue-50/30' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                      isDayToday ? 'bg-blue-600 text-white' : ''
                    }`}>
                      {format(day, 'd')}
                    </span>
                    {dayPosts.length > 0 && (
                      <span className="text-[10px] font-bold text-gray-400">{dayPosts.length} post{dayPosts.length > 1 ? 's' : ''}</span>
                    )}
                  </div>

                  {/* Day Posts List */}
                  <div className="space-y-1.5 overflow-y-auto max-h-[100px] pr-0.5">
                    {dayPosts.map((post) => (
                      <div
                        key={post.id}
                        onClick={() => setPreviewPost(post)}
                        className={`p-2 rounded-lg text-xs border transition-all cursor-pointer hover:shadow-md space-y-1 ${
                          post.status === 'scheduled' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
                          post.status === 'suggested' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                          'bg-blue-50 border-blue-200 text-blue-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[10px] uppercase truncate max-w-[80px]">{post.status}</span>
                          <Eye className="w-3 h-3 text-gray-500 hover:text-black shrink-0" />
                        </div>
                        <p className="text-[11px] font-medium line-clamp-2 leading-tight">{post.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* List View */
        <div className="space-y-4">
          {posts.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <CalendarIcon className="w-8 h-8 text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No Posts Found</h2>
              <p className="text-gray-500 max-w-md mx-auto mb-6">Create posts in Content Studio or run your Agent Workforce to generate posts.</p>
              <button
                onClick={() => navigate('/create')}
                className="px-5 py-2.5 bg-black text-white font-semibold rounded-xl text-xs hover:bg-gray-800 transition-all inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Go to Content Studio
              </button>
            </div>
          ) : (
            posts.map((post) => (
              <div key={post.id} className={`bg-white border rounded-2xl p-6 shadow-sm flex flex-col md:flex-row gap-6 transition-all ${post.status === 'suggested' ? 'border-amber-200 bg-amber-50/10' : 'border-gray-200'}`}>
                {/* Media Preview */}
                <div className="w-full md:w-48 h-48 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                  {post.mediaType === 'image' && post.mediaUrl ? (
                    <img src={post.mediaUrl} alt="Post preview" className="w-full h-full object-cover" />
                  ) : post.mediaType === 'video' && post.mediaUrl ? (
                    <video src={post.mediaUrl} className="w-full h-full object-cover" />
                  ) : (
                    <TypeIcon className="w-12 h-12 text-gray-300" />
                  )}
                </div>

                {/* Content Details */}
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md ${post.status === 'suggested' ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                          <Clock className="w-3.5 h-3.5" />
                          {post.scheduledTime ? format(getSafeDate(post.scheduledTime), "MMM d, yyyy 'at' h:mm a") : 'Unscheduled'}
                        </div>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md uppercase tracking-wider ${
                          post.status === 'suggested' ? 'bg-amber-100 text-amber-700' : 
                          post.status === 'scheduled' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {post.status}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Live Platform Preview Button */}
                        <button
                          onClick={() => setPreviewPost(post)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-medium rounded-lg transition-colors"
                          title="Preview how this post looks on LinkedIn, Twitter, IG, Facebook"
                        >
                          <Eye className="w-3.5 h-3.5 text-gray-600" />
                          Preview Card
                        </button>

                        {editingPostId === post.id ? (
                          <>
                            <button 
                              onClick={() => handleUpdate(post.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors"
                            >
                              Save
                            </button>
                            <button 
                              onClick={() => setEditingPostId(null)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => {
                                setEditingPostId(post.id);
                                setEditingContent(post.content);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              Edit
                            </button>

                            {post.status === 'suggested' && (
                              <button 
                                onClick={() => handleApprove(post.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                Approve & Schedule
                              </button>
                            )}

                            <button
                              onClick={async () => {
                                try {
                                  const results = await publishPostToPlatforms({
                                    content: post.content,
                                    mediaUrl: post.mediaUrl,
                                    platforms: post.platforms || ['twitter', 'linkedin']
                                  });
                                  const summary = results.map(r => `${r.platform}: ${r.message}`).join('\n');
                                  alert(`Publish Results:\n\n${summary}`);
                                  await updatePost(post.id, { status: 'published' });
                                  setPosts(posts.map(p => p.id === post.id ? { ...p, status: 'published' } : p));
                                } catch (err: any) {
                                  alert(`Failed to publish: ${err.message || String(err)}`);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                              title="Publish directly to connected social accounts"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Publish Now
                            </button>
                          </>
                        )}

                        <button 
                          onClick={() => handleDelete(post.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {editingPostId === post.id ? (
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all resize-none mb-4 font-sans"
                      />
                    ) : (
                      <p className="text-sm text-gray-800 whitespace-pre-wrap flex-1 line-clamp-4 leading-relaxed font-sans">
                        {post.content}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Platforms:</span>
                      <div className="flex gap-2">
                        {(post.platforms || ['linkedin', 'twitter']).map((platform: string) => (
                          <span key={platform} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md capitalize font-semibold">
                            {platform}
                          </span>
                        ))}
                      </div>
                    </div>
                    {post.status === 'suggested' && (
                      <span className="text-[10px] font-medium text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                        Awaiting Approval
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Live Social Media Post Preview Modal */}
      {previewPost && (
        <PostPreviewModal
          post={previewPost}
          brand={brand}
          onClose={() => setPreviewPost(null)}
        />
      )}
    </div>
  );
}
