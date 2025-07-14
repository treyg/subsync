import type { PlatformContent, TransferResult } from '../types';

interface YouTubePlaylist {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
  status: {
    privacyStatus: string;
  };
  contentDetails: {
    itemCount: number;
  };
}

interface YouTubePlaylistsResponse {
  items: YouTubePlaylist[];
  nextPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
}

interface YouTubePlaylistItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    resourceId: {
      videoId: string;
    };
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
}

interface YouTubePlaylistItemsResponse {
  items: YouTubePlaylistItem[];
  nextPageToken?: string;
}

export function createYouTubePlaylists() {
  async function getUserPlaylists(accessToken: string): Promise<PlatformContent[]> {
    const playlists: PlatformContent[] = [];
    let nextPageToken: string | undefined;

    do {
      const url = new URL("https://www.googleapis.com/youtube/v3/playlists");
      url.searchParams.set("part", "snippet,status,contentDetails");
      url.searchParams.set("mine", "true");
      url.searchParams.set("maxResults", "50");
      if (nextPageToken) {
        url.searchParams.set("pageToken", nextPageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Access token expired or invalid");
        }
        const error = await response.text();
        throw new Error(`Failed to fetch playlists: ${error}`);
      }

      const data = (await response.json()) as YouTubePlaylistsResponse;

      for (const item of data.items) {
        playlists.push({
          id: item.id,
          name: item.snippet.title,
          title: item.snippet.title,
          url: `https://www.youtube.com/playlist?list=${item.id}`,
          platform: 'youtube',
          type: 'playlist',
          createdAt: new Date(item.snippet.publishedAt),
          author: item.snippet.channelTitle,
        });
      }

      nextPageToken = data.nextPageToken;

      if (nextPageToken) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (nextPageToken);

    return playlists;
  }

  async function createPlaylist(accessToken: string, title: string, description?: string, isPrivate: boolean = false): Promise<TransferResult> {
    try {
      const response = await fetch("https://www.googleapis.com/youtube/v3/playlists", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snippet: {
            title,
            description: description || "",
          },
          status: {
            privacyStatus: isPrivate ? "private" : "public",
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        if (response.status === 403) {
          return {
            targetId: title,
            targetName: title,
            success: false,
            error: "Access denied - unable to create playlist",
          };
        } else if (response.status === 409) {
          return {
            targetId: title,
            targetName: title,
            success: false,
            error: "Playlist with this name already exists",
          };
        }

        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json() as any;
      return {
        targetId: result.id,
        targetName: title,
        success: true,
      };
    } catch (error) {
      console.error(`YouTube create playlist error for "${title}":`, error);
      return {
        targetId: title,
        targetName: title,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async function deletePlaylist(accessToken: string, playlistId: string): Promise<TransferResult> {
    try {
      // First get playlist info for the name
      const getResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      let playlistName = playlistId;
      if (getResponse.ok) {
        const data = (await getResponse.json()) as YouTubePlaylistsResponse;
        if (data.items && data.items.length > 0) {
          playlistName = data.items[0]?.snippet?.title || playlistName;
        }
      }

      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/playlists?id=${playlistId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        if (response.status === 403) {
          return {
            targetId: playlistId,
            targetName: playlistName,
            success: false,
            error: "Access denied - unable to delete playlist",
          };
        } else if (response.status === 404) {
          return {
            targetId: playlistId,
            targetName: playlistName,
            success: false,
            error: "Playlist not found",
          };
        }

        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return {
        targetId: playlistId,
        targetName: playlistName,
        success: true,
      };
    } catch (error) {
      return {
        targetId: playlistId,
        targetName: playlistId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async function getPlaylistItems(accessToken: string, playlistId: string): Promise<YouTubePlaylistItem[]> {
    const items: YouTubePlaylistItem[] = [];
    let nextPageToken: string | undefined;

    do {
      const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("playlistId", playlistId);
      url.searchParams.set("maxResults", "50");
      if (nextPageToken) {
        url.searchParams.set("pageToken", nextPageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch playlist items: ${response.status}`);
      }

      const data = (await response.json()) as YouTubePlaylistItemsResponse;
      items.push(...data.items);
      nextPageToken = data.nextPageToken;

      if (nextPageToken) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (nextPageToken);

    return items;
  }

  async function addVideoToPlaylist(accessToken: string, playlistId: string, videoId: string): Promise<TransferResult> {
    try {
      const response = await fetch("https://www.googleapis.com/youtube/v3/playlistItems", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snippet: {
            playlistId,
            resourceId: {
              kind: "youtube#video",
              videoId,
            },
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        if (response.status === 403) {
          return {
            targetId: videoId,
            targetName: videoId,
            success: false,
            error: "Access denied - unable to add video to playlist",
          };
        } else if (response.status === 404) {
          return {
            targetId: videoId,
            targetName: videoId,
            success: false,
            error: "Video or playlist not found",
          };
        }

        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return {
        targetId: videoId,
        targetName: videoId,
        success: true,
      };
    } catch (error) {
      return {
        targetId: videoId,
        targetName: videoId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  return {
    getUserPlaylists,
    createPlaylist,
    deletePlaylist,
    getPlaylistItems,
    addVideoToPlaylist,
  };
}