export interface PostPayload {
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'none';
  platforms: string[];
}

export interface PlatformPublishResult {
  platform: string;
  status: 'published' | 'intent_opened' | 'failed';
  message: string;
  shareUrl?: string;
  postId?: string;
}

// 1. Twitter / X Posting
export const publishToTwitter = async (content: string, mediaUrl?: string): Promise<PlatformPublishResult> => {
  const token = localStorage.getItem('twitter_api_key');

  if (token) {
    try {
      const res = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text: content })
      });

      if (res.ok) {
        const data = await res.json();
        return {
          platform: 'Twitter (X)',
          status: 'published',
          postId: data.data?.id,
          message: 'Successfully posted directly to Twitter (X) via API!'
        };
      }
      throw new Error(`API returned HTTP ${res.status}`);
    } catch (err: any) {
      console.warn("Direct Twitter API post failed, using Web Intent fallback:", err);
    }
  }

  // Intent Fallback
  const tweetText = encodeURIComponent(content);
  const intentUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;
  window.open(intentUrl, '_blank', 'noopener,noreferrer');
  
  return {
    platform: 'Twitter (X)',
    status: 'intent_opened',
    shareUrl: intentUrl,
    message: 'Opened Twitter Web Share dialog with pre-filled content.'
  };
};

// 2. LinkedIn Posting
export const publishToLinkedIn = async (content: string, mediaUrl?: string): Promise<PlatformPublishResult> => {
  const token = localStorage.getItem('linkedin_access_token');

  if (token) {
    try {
      // Fetch user URN profile first if possible
      const profileRes = await fetch('https://api.linkedin.com/v2/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        const authorUrn = `urn:li:person:${profileData.id}`;

        const postBody = {
          author: authorUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: content },
              shareMediaCategory: mediaUrl ? 'IMAGE' : 'NONE',
              ...(mediaUrl ? {
                media: [{
                  status: 'READY',
                  description: { text: content.substring(0, 100) },
                  originalUrl: mediaUrl,
                  title: { text: 'Post' }
                }]
              } : {})
            }
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
          }
        };

        const postRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Restli-Protocol-Version': '2.0.0'
          },
          body: JSON.stringify(postBody)
        });

        if (postRes.ok) {
          const postData = await postRes.json();
          return {
            platform: 'LinkedIn',
            status: 'published',
            postId: postData.id,
            message: 'Successfully published to LinkedIn via API!'
          };
        }
      }
    } catch (err: any) {
      console.warn("Direct LinkedIn API post failed, using Web Intent fallback:", err);
    }
  }

  // Web Share Fallback
  const textEncoded = encodeURIComponent(content);
  const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?text=${textEncoded}`;
  window.open(shareUrl, '_blank', 'noopener,noreferrer');

  return {
    platform: 'LinkedIn',
    status: 'intent_opened',
    shareUrl: shareUrl,
    message: 'Opened LinkedIn Web Share dialog.'
  };
};

// 3. Facebook Posting
export const publishToFacebook = async (content: string, mediaUrl?: string): Promise<PlatformPublishResult> => {
  const token = localStorage.getItem('facebook_access_token');

  if (token) {
    try {
      const endpoint = mediaUrl 
        ? `https://graph.facebook.com/v19.0/me/photos` 
        : `https://graph.facebook.com/v19.0/me/feed`;

      const bodyData: any = {
        access_token: token,
        ...(mediaUrl ? { url: mediaUrl, caption: content } : { message: content })
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });

      if (res.ok) {
        const data = await res.json();
        return {
          platform: 'Facebook',
          status: 'published',
          postId: data.id,
          message: 'Successfully published to Facebook Page via Graph API!'
        };
      }
    } catch (err: any) {
      console.warn("Direct Facebook Graph API post failed, using Web Share fallback:", err);
    }
  }

  const fbShareUrl = `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(content)}`;
  window.open(fbShareUrl, '_blank', 'noopener,noreferrer');

  return {
    platform: 'Facebook',
    status: 'intent_opened',
    shareUrl: fbShareUrl,
    message: 'Opened Facebook Web Share dialog.'
  };
};

// 4. Instagram Posting
export const publishToInstagram = async (content: string, mediaUrl?: string): Promise<PlatformPublishResult> => {
  const token = localStorage.getItem('instagram_access_token');

  if (token && mediaUrl) {
    try {
      // Step 1: Create Container
      const containerRes = await fetch(`https://graph.facebook.com/v19.0/me/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: mediaUrl,
          caption: content,
          access_token: token
        })
      });

      if (containerRes.ok) {
        const containerData = await containerRes.json();
        const creationId = containerData.id;

        // Step 2: Publish Container
        const publishRes = await fetch(`https://graph.facebook.com/v19.0/me/media_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: creationId,
            access_token: token
          })
        });

        if (publishRes.ok) {
          const pubData = await publishRes.json();
          return {
            platform: 'Instagram',
            status: 'published',
            postId: pubData.id,
            message: 'Successfully published image container to Instagram Graph API!'
          };
        }
      }
    } catch (err: any) {
      console.warn("Direct Instagram Graph API post failed:", err);
    }
  }

  // Fallback notice
  navigator.clipboard.writeText(content);
  window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');

  return {
    platform: 'Instagram',
    status: 'intent_opened',
    message: 'Copied post caption to clipboard & opened Instagram.'
  };
};

// Main Multi-Platform Publisher Dispatcher
export const publishPostToPlatforms = async (payload: PostPayload): Promise<PlatformPublishResult[]> => {
  const results: PlatformPublishResult[] = [];
  const { content, mediaUrl, platforms } = payload;

  for (const p of platforms) {
    const platformId = p.toLowerCase();

    if (platformId.includes('twitter') || platformId.includes('x')) {
      const res = await publishToTwitter(content, mediaUrl);
      results.push(res);
    } else if (platformId.includes('linkedin')) {
      const res = await publishToLinkedIn(content, mediaUrl);
      results.push(res);
    } else if (platformId.includes('facebook')) {
      const res = await publishToFacebook(content, mediaUrl);
      results.push(res);
    } else if (platformId.includes('instagram')) {
      const res = await publishToInstagram(content, mediaUrl);
      results.push(res);
    }
  }

  return results;
};
