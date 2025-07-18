import type { PlatformContent, TransferResult } from '../types';

interface RedditSavedPost {
  kind: string;
  data: {
    id: string;
    name: string;
    subreddit: string;
    title: string;
    url: string;
    permalink: string;
    created_utc: number;
    saved: boolean;
    is_self: boolean;
    selftext?: string;
    author?: string;
  };
}

interface RedditListingResponse {
  data: {
    children: RedditSavedPost[];
    after: string | null;
    before: string | null;
  };
}

export function createRedditSavedPosts() {
  async function getSavedPosts(accessToken: string, username?: string): Promise<PlatformContent[]> {
    const savedPosts: PlatformContent[] = [];
    let after: string | null = null;

    do {
      const url = new URL(`https://oauth.reddit.com/user/${username || 'me'}/saved.json`);
      url.searchParams.set("limit", "100");
      if (after) {
        url.searchParams.set("after", after);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "subsync-app/1.0.0",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 401) {
          throw new Error("Access token expired or invalid");
        } else if (response.status === 403) {
          throw new Error("Access denied - insufficient permissions to access saved posts");
        } else if (response.status === 404) {
          throw new Error("User not found or saved posts endpoint not available");
        }
        
        throw new Error(`Failed to fetch saved posts (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as RedditListingResponse;

      for (const child of data.data.children) {
        const post = child.data;
        savedPosts.push({
          id: post.id,
          name: post.name,
          title: post.title,
          url: post.url,
          platform: 'reddit',
          type: 'post',
          createdAt: new Date(post.created_utc * 1000),
          author: post.author,
        });
      }

      after = data.data.after;

      if (after) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (after);

    return savedPosts;
  }

  async function savePost(accessToken: string, postName: string): Promise<TransferResult> {
    try {
      const response = await fetch("https://oauth.reddit.com/api/save", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "subsync-app/1.0.0",
        },
        body: new URLSearchParams({
          id: postName,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Reddit save post error for ${postName}:`, response.status, errorText);
        
        if (response.status === 400) {
          // Parse the error response to get more details
          let errorDetails = errorText;
          try {
            const errorData = JSON.parse(errorText);
            errorDetails = errorData.message || errorData.error || errorText;
          } catch {
            // If parsing fails, use the raw error text
          }
          
          // Check for specific 400 error cases
          if (errorDetails.includes('already_saved') || errorDetails.includes('ALREADY_SAVED')) {
            return {
              targetId: postName,
              targetName: postName,
              success: true,
              alreadyExists: true,
            };
          } else if (errorDetails.includes('invalid') || errorDetails.includes('INVALID')) {
            return {
              targetId: postName,
              targetName: postName,
              success: false,
              error: "Invalid post ID or post no longer exists",
            };
          } else {
            return {
              targetId: postName,
              targetName: postName,
              success: false,
              error: `Bad request: ${errorDetails}`,
            };
          }
        } else if (response.status === 403) {
          return {
            targetId: postName,
            targetName: postName,
            success: false,
            error: "Access denied - unable to save post (may be private or restricted)",
          };
        } else if (response.status === 404) {
          return {
            targetId: postName,
            targetName: postName,
            success: false,
            error: "Post not found or deleted",
          };
        } else if (response.status === 401) {
          return {
            targetId: postName,
            targetName: postName,
            success: false,
            error: "Authentication expired - please reconnect your account",
          };
        }
        
        // Generic error for other status codes
        return {
          targetId: postName,
          targetName: postName,
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      // Success case
      return {
        targetId: postName,
        targetName: postName,
        success: true,
      };
    } catch (error) {
      console.error(`Reddit save post catch error for ${postName}:`, error);
      return {
        targetId: postName,
        targetName: postName,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  return {
    getSavedPosts,
    savePost,
  };
}