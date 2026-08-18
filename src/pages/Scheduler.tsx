import { useEffect, useState } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, orderBy, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { Calendar, Clock, Trash2, Image as ImageIcon, Video, Type as TypeIcon, CheckCircle2 } from 'lucide-react';

export function Scheduler() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  useEffect(() => {
    const fetchPosts = async () => {
      if (!auth.currentUser) return;
      try {
        const activeBrandId = localStorage.getItem('activeBrandId');
        let q;
        if (activeBrandId) {
          q = query(
            collection(db, 'posts'),
            where('userId', '==', auth.currentUser.uid),
            where('brandId', '==', activeBrandId),
            orderBy('scheduledTime', 'asc')
          );
        } else {
          q = query(
            collection(db, 'posts'),
            where('userId', '==', auth.currentUser.uid),
            orderBy('scheduledTime', 'asc')
          );
        }
        const snapshot = await getDocs(q);
        const postsData = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setPosts(postsData);
      } catch (error) {
        console.error("Error fetching posts:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    try {
      await deleteDoc(doc(db, 'posts', id));
      setPosts(posts.filter(p => p.id !== id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `posts/${id}`);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, 'posts', id), {
        status: 'scheduled',
        updatedAt: serverTimestamp()
      });
      setPosts(posts.map(p => p.id === id ? { ...p, status: 'scheduled' } : p));
      alert("Post approved and scheduled!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${id}`);
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await updateDoc(doc(db, 'posts', id), {
        content: editingContent,
        updatedAt: serverTimestamp()
      });
      setPosts(posts.map(p => p.id === id ? { ...p, content: editingContent } : p));
      setEditingPostId(null);
      alert("Post updated successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${id}`);
    }
  };

  if (loading) return <div className="p-8">Loading schedule...</div>;

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Content Schedule</h1>
          <p className="text-gray-500 mt-1">Manage your upcoming social media posts.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-700">
          <Calendar className="w-4 h-4" />
          {posts.filter(p => p.status === 'scheduled').length} Posts Scheduled
        </div>
      </header>

      {posts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Calendar className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No Scheduled Posts</h2>
          <p className="text-gray-500 max-w-md mx-auto mb-8">
            You haven't scheduled any content yet. Head over to the Content Generator to create your first post.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
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
              <div className="flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md ${post.status === 'suggested' ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                      <Clock className="w-3.5 h-3.5" />
                      {post.scheduledTime ? format(post.scheduledTime.toDate(), "MMM d, yyyy 'at' h:mm a") : 'Unscheduled'}
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
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Approve
                          </button>
                        )}
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
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all resize-none mb-4"
                  />
                ) : (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap flex-1 line-clamp-4">
                    {post.content}
                  </p>
                )}

                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Platforms:</span>
                    <div className="flex gap-2">
                      {post.platforms?.map((platform: string) => (
                        <span key={platform} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md capitalize">
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
          ))}
        </div>
      )}
    </div>
  );
}
