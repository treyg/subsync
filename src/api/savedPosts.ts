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
  };
}

interface RedditListingResponse {
  data: {
    children: RedditSavedPost[];
    after: string | null;
    before: string | null;
  };
}

interface SavedPostsExport {
  version: string;
  exportedAt: string;
  username: string;
  posts: Array<{
    id: string;
    name: string;
    subreddit: string;
    title: string;
    url: string;
    permalink: string;
    created_utc: number;
    is_self: boolean;
    selftext?: string;
  }>;
}

interface SavedPostsTransferResult {
  postId: string;
  success: boolean;
  error?: string;
  alreadySaved?: boolean;
}

export function createSavedPostsAPI() {
  async function getSavedPosts(accessToken: string, username?: string): Promise<RedditSavedPost[]> {
    const savedPosts: RedditSavedPost[] = [];
    let after: string | null = null;

    do {
      // Use the endpoint format from the chatbot suggestion
      const url = new URL(`https://oauth.reddit.com/user/${username || 'me'}/saved.json`);
      url.searchParams.set("limit", "100");
      if (after) {
        url.searchParams.set("after", after);
      }

      console.log(`Fetching saved posts from: ${url.toString()}`);
      
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "reddit-transfer-app/1.0.0",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Reddit API Error - Status: ${response.status}, Response: ${errorText}`);
        
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
        savedPosts.push(child);
      }

      after = data.data.after;

      // Rate limiting: Reddit allows 100 requests per minute
      if (after) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (after);

    return savedPosts;
  }

  async function exportSavedPosts(accessToken: string, username: string): Promise<SavedPostsExport> {
    const savedPosts = await getSavedPosts(accessToken, username);
    
    return {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      username: username,
      posts: savedPosts.map(post => ({
        id: post.data.id,
        name: post.data.name,
        subreddit: post.data.subreddit,
        title: post.data.title,
        url: post.data.url,
        permalink: post.data.permalink,
        created_utc: post.data.created_utc,
        is_self: post.data.is_self,
        selftext: post.data.selftext,
      }))
    };
  }

  async function savePost(accessToken: string, postName: string): Promise<SavedPostsTransferResult> {
    try {
      console.log(`Attempting to save post: ${postName}`);
      
      const response = await fetch("https://oauth.reddit.com/api/save", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "reddit-transfer-app/1.0.0",
        },
        body: new URLSearchParams({
          id: postName,
        }),
      });

      console.log(`Save post response: ${response.status} - ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 403) {
          return {
            postId: postName,
            success: false,
            error: "Access denied - unable to save post",
          };
        } else if (response.status === 404) {
          return {
            postId: postName,
            success: false,
            error: "Post not found or deleted",
          };
        }
        
        // Check if already saved (Reddit doesn't return an error for already saved posts)
        if (response.status === 200) {
          return {
            postId: postName,
            success: true,
            alreadySaved: true,
          };
        }
        
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return {
        postId: postName,
        success: true,
      };
    } catch (error) {
      return {
        postId: postName,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async function savePostsFromFile(tempFilePath: string): Promise<SavedPostsExport | null> {
    try {
      const file = Bun.file(tempFilePath);
      if (!await file.exists()) {
        return null;
      }
      
      const content = await file.text();
      const exportData = JSON.parse(content) as SavedPostsExport;
      
      // Validate the format
      if (!exportData.version || !exportData.posts || !Array.isArray(exportData.posts)) {
        throw new Error("Invalid saved posts file format");
      }
      
      return exportData;
    } catch (error) {
      throw new Error(`Failed to read saved posts file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function writeSavedPostsToFile(exportData: SavedPostsExport, tempFilePath: string): Promise<void> {
    try {
      await Bun.write(tempFilePath, JSON.stringify(exportData, null, 2));
    } catch (error) {
      throw new Error(`Failed to write saved posts file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return {
    getSavedPosts,
    exportSavedPosts,
    savePost,
    savePostsFromFile,
    writeSavedPostsToFile,
  };
}