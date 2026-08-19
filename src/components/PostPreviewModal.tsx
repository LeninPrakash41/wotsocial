import React, { useState } from 'react';
import { X, Heart, MessageCircle, Share2, Repeat, ThumbsUp, Send, Bookmark, MoreHorizontal, Globe, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { getSafeDate } from '../dbAdapter';

interface PostPreviewModalProps {
  post: {
    id: string;
    content: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'text';
    scheduledTime?: any;
    status?: string;
    platforms?: string[];
  } | null;
  brand?: {
    name?: string;
    logoUrl?: string;
    websiteUrl?: string;
  } | null;
  onClose: () => void;
}

export function PostPreviewModal({ post, brand, onClose }: PostPreviewModalProps) {
  const [activePlatform, setActivePlatform] = useState<'linkedin' | 'twitter' | 'instagram' | 'facebook'>('linkedin');

  if (!post) return null;

  const brandName = brand?.name || 'Your Brand';
  const handle = '@' + brandName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const logo = brand?.logoUrl;
  const postDate = getSafeDate(post.scheduledTime);
  const formattedDate = format(postDate, "MMM d, yyyy 'at' h:mm a");

  // Highlight hashtags and mentions in text
  const renderFormattedText = (text: string) => {
    const parts = text.split(/(\s+)/);
    return parts.map((part, idx) => {
      if (part.startsWith('#')) {
        return <span key={idx} className="text-blue-600 font-semibold">{part}</span>;
      }
      if (part.startsWith('@')) {
        return <span key={idx} className="text-blue-500 font-semibold">{part}</span>;
      }
      if (part.startsWith('http://') || part.startsWith('https://')) {
        return <span key={idx} className="text-blue-600 underline">{part}</span>;
      }
      return part;
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gray-900 text-white flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              Social Media Post Preview
              <span className="text-[10px] font-bold bg-amber-400 text-black px-2 py-0.5 rounded uppercase">{post.status || 'Draft'}</span>
            </h3>
            <p className="text-xs text-gray-400">Scheduled for {formattedDate}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-6 pt-3 gap-2 overflow-x-auto">
          <button
            onClick={() => setActivePlatform('linkedin')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 ${
              activePlatform === 'linkedin'
                ? 'border-blue-700 text-blue-700 bg-white shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            LinkedIn Card
          </button>
          <button
            onClick={() => setActivePlatform('twitter')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 ${
              activePlatform === 'twitter'
                ? 'border-sky-500 text-sky-500 bg-white shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            X / Twitter Card
          </button>
          <button
            onClick={() => setActivePlatform('instagram')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 ${
              activePlatform === 'instagram'
                ? 'border-pink-600 text-pink-600 bg-white shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Instagram Card
          </button>
          <button
            onClick={() => setActivePlatform('facebook')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 ${
              activePlatform === 'facebook'
                ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            Facebook Card
          </button>
        </div>

        {/* Preview Container */}
        <div className="p-6 bg-gray-100 flex items-center justify-center min-h-[400px]">

          {/* 1. LinkedIn Card */}
          {activePlatform === 'linkedin' && (
            <div className="bg-white border border-gray-200 rounded-xl max-w-lg w-full shadow-sm text-gray-900 font-sans">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center overflow-hidden font-bold text-blue-700 text-sm">
                    {logo ? <img src={logo} alt={brandName} className="w-full h-full object-cover" /> : brandName.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <h4 className="font-bold text-xs text-gray-900">{brandName}</h4>
                      <span className="text-[10px] text-gray-400">• 1st</span>
                    </div>
                    <p className="text-[10px] text-gray-500 line-clamp-1">Official Brand Account</p>
                    <div className="flex items-center gap-1 text-[10px] text-gray-400">
                      <span>Scheduled for {formattedDate}</span>
                      <span>•</span>
                      <Globe className="w-3 h-3 text-gray-400" />
                    </div>
                  </div>
                </div>
                <MoreHorizontal className="w-4 h-4 text-gray-400" />
              </div>

              <div className="px-4 pb-3 text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                {renderFormattedText(post.content)}
              </div>

              {post.mediaUrl && (
                <div className="bg-black/5 border-y border-gray-100 overflow-hidden max-h-80 flex items-center justify-center">
                  {post.mediaType === 'video' ? (
                    <video src={post.mediaUrl} controls className="w-full max-h-80 object-contain" />
                  ) : (
                    <img src={post.mediaUrl} alt="Media" className="w-full max-h-80 object-cover" />
                  )}
                </div>
              )}

              <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 font-medium">
                <button className="flex items-center gap-1.5 hover:bg-gray-50 px-2 py-1.5 rounded transition-colors"><ThumbsUp className="w-4 h-4 text-blue-600" /> Like</button>
                <button className="flex items-center gap-1.5 hover:bg-gray-50 px-2 py-1.5 rounded transition-colors"><MessageCircle className="w-4 h-4 text-gray-500" /> Comment</button>
                <button className="flex items-center gap-1.5 hover:bg-gray-50 px-2 py-1.5 rounded transition-colors"><Repeat className="w-4 h-4 text-gray-500" /> Repost</button>
                <button className="flex items-center gap-1.5 hover:bg-gray-50 px-2 py-1.5 rounded transition-colors"><Send className="w-4 h-4 text-gray-500" /> Send</button>
              </div>
            </div>
          )}

          {/* 2. Twitter Card */}
          {activePlatform === 'twitter' && (
            <div className="bg-white border border-gray-200 rounded-xl max-w-lg w-full shadow-sm text-gray-900 p-4 font-sans space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sky-100 border border-sky-200 flex items-center justify-center overflow-hidden font-bold text-sky-600 text-sm">
                    {logo ? <img src={logo} alt={brandName} className="w-full h-full object-cover" /> : brandName.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <h4 className="font-bold text-xs text-gray-900">{brandName}</h4>
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-500 fill-sky-500 text-white" />
                    </div>
                    <p className="text-[11px] text-gray-500">{handle}</p>
                  </div>
                </div>
                <MoreHorizontal className="w-4 h-4 text-gray-400" />
              </div>

              <div className="text-xs text-gray-900 whitespace-pre-wrap leading-normal">
                {renderFormattedText(post.content)}
              </div>

              {post.mediaUrl && (
                <div className="rounded-xl overflow-hidden border border-gray-200 max-h-72 bg-black/5">
                  {post.mediaType === 'video' ? (
                    <video src={post.mediaUrl} controls className="w-full max-h-72 object-contain" />
                  ) : (
                    <img src={post.mediaUrl} alt="Media" className="w-full max-h-72 object-cover" />
                  )}
                </div>
              )}

              <div className="text-[11px] text-gray-400 border-t border-gray-100 pt-2 flex items-center gap-1">
                <span>{formattedDate}</span>
                <span>•</span>
                <span className="font-bold text-gray-700">WotSocial Studio</span>
              </div>

              <div className="border-t border-gray-100 pt-2 flex items-center justify-between text-gray-500 text-xs px-2">
                <button className="flex items-center gap-1 hover:text-sky-500"><MessageCircle className="w-4 h-4" /> 0</button>
                <button className="flex items-center gap-1 hover:text-emerald-500"><Repeat className="w-4 h-4" /> 0</button>
                <button className="flex items-center gap-1 hover:text-pink-500"><Heart className="w-4 h-4" /> 0</button>
                <button className="flex items-center gap-1 hover:text-sky-500"><Bookmark className="w-4 h-4" /></button>
                <button className="flex items-center gap-1 hover:text-sky-500"><Share2 className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {/* 3. Instagram Card */}
          {activePlatform === 'instagram' && (
            <div className="bg-white border border-gray-200 rounded-xl max-w-sm w-full shadow-sm text-gray-900 font-sans overflow-hidden">
              <div className="p-3 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600">
                    <div className="w-full h-full rounded-full bg-white p-[1px]">
                      {logo ? <img src={logo} alt={brandName} className="w-full h-full rounded-full object-cover" /> : <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold">{brandName.charAt(0)}</div>}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-gray-900 leading-none">{handle}</h4>
                    <p className="text-[9px] text-gray-400 mt-0.5">Original Content</p>
                  </div>
                </div>
                <MoreHorizontal className="w-4 h-4 text-gray-500" />
              </div>

              {post.mediaUrl ? (
                <div className="bg-black/5 aspect-square overflow-hidden flex items-center justify-center">
                  {post.mediaType === 'video' ? (
                    <video src={post.mediaUrl} controls className="w-full h-full object-cover" />
                  ) : (
                    <img src={post.mediaUrl} alt="Media" className="w-full h-full object-cover" />
                  )}
                </div>
              ) : (
                <div className="p-6 bg-gradient-to-br from-purple-500 to-pink-500 aspect-square flex items-center justify-center text-white p-4 text-center font-bold text-sm">
                  {post.content.slice(0, 120)}...
                </div>
              )}

              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between text-gray-800">
                  <div className="flex items-center gap-3">
                    <Heart className="w-5 h-5 hover:text-red-500 cursor-pointer" />
                    <MessageCircle className="w-5 h-5 hover:text-gray-500 cursor-pointer" />
                    <Send className="w-5 h-5 hover:text-gray-500 cursor-pointer" />
                  </div>
                  <Bookmark className="w-5 h-5 hover:text-gray-500 cursor-pointer" />
                </div>

                <div className="text-xs">
                  <span className="font-bold mr-1.5">{handle}</span>
                  <span className="text-gray-800 whitespace-pre-wrap">{renderFormattedText(post.content)}</span>
                </div>
              </div>
            </div>
          )}

          {/* 4. Facebook Card */}
          {activePlatform === 'facebook' && (
            <div className="bg-white border border-gray-200 rounded-xl max-w-lg w-full shadow-sm text-gray-900 font-sans p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm overflow-hidden">
                    {logo ? <img src={logo} alt={brandName} className="w-full h-full object-cover" /> : brandName.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-gray-900">{brandName}</h4>
                    <div className="flex items-center gap-1 text-[10px] text-gray-400">
                      <span>{formattedDate}</span>
                      <span>•</span>
                      <Globe className="w-3 h-3" />
                    </div>
                  </div>
                </div>
                <MoreHorizontal className="w-4 h-4 text-gray-400" />
              </div>

              <div className="text-xs text-gray-900 whitespace-pre-wrap leading-relaxed">
                {renderFormattedText(post.content)}
              </div>

              {post.mediaUrl && (
                <div className="rounded-lg overflow-hidden border border-gray-100 max-h-80 bg-black/5">
                  {post.mediaType === 'video' ? (
                    <video src={post.mediaUrl} controls className="w-full max-h-80 object-contain" />
                  ) : (
                    <img src={post.mediaUrl} alt="Media" className="w-full max-h-80 object-cover" />
                  )}
                </div>
              )}

              <div className="border-t border-gray-100 pt-2 flex items-center justify-between text-gray-500 text-xs px-4">
                <button className="flex items-center gap-1.5 hover:bg-gray-50 px-3 py-1.5 rounded"><ThumbsUp className="w-4 h-4 text-blue-600" /> Like</button>
                <button className="flex items-center gap-1.5 hover:bg-gray-50 px-3 py-1.5 rounded"><MessageCircle className="w-4 h-4" /> Comment</button>
                <button className="flex items-center gap-1.5 hover:bg-gray-50 px-3 py-1.5 rounded"><Share2 className="w-4 h-4" /> Share</button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-gray-800 transition-all"
          >
            Close Preview
          </button>
        </div>

      </div>
    </div>
  );
}
