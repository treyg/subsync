import type { PlatformSubscription, TransferResult } from '../types';

interface YouTubeSubscription {
  id: string;
  snippet: {
    resourceId: {
      channelId: string;
    };
    title: string;
    description: string;
    channelId: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
  statistics?: {
    subscriberCount: string;
  };
}

interface YouTubeSubscriptionsResponse {
  items: YouTubeSubscription[];
  nextPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
}

interface YouTubeChannel {
  id: string;
  snippet: {
    title: string;
    description: string;
    customUrl?: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
  statistics: {
    subscriberCount: string;
  };
}

interface YouTubeChannelsResponse {
  items: YouTubeChannel[];
}

export function createYouTubeSubscriptions() {
  async function getSubscriptions(accessToken: string): Promise<PlatformSubscription[]> {
    const subscriptions: PlatformSubscription[] = [];
    let nextPageToken: string | undefined;

    do {
      const url = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
      url.searchParams.set("part", "snippet");
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
        if (response.status === 403 && error.includes("quotaExceeded")) {
          throw new Error("YouTube API quota exceeded. Please wait 24 hours or request a quota increase in Google Cloud Console.");
        }
        throw new Error(`Failed to fetch subscriptions: ${error}`);
      }

      const data = (await response.json()) as YouTubeSubscriptionsResponse;

      // Get channel statistics for subscriber counts
      const channelIds = data.items.map(item => item.snippet.resourceId.channelId);
      let channelStats: Map<string, number> = new Map();

      if (channelIds.length > 0) {
        try {
          const statsUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
          statsUrl.searchParams.set("part", "statistics");
          statsUrl.searchParams.set("id", channelIds.join(","));

          const statsResponse = await fetch(statsUrl.toString(), {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (statsResponse.ok) {
            const statsData = (await statsResponse.json()) as YouTubeChannelsResponse;
            channelStats = new Map(
              statsData.items.map(channel => [
                channel.id,
                parseInt(channel.statistics.subscriberCount) || 0
              ])
            );
          }
        } catch (error) {
          console.warn("Failed to fetch channel statistics:", error);
        }
      }

      for (const item of data.items) {
        const channelId = item.snippet.resourceId.channelId;
        subscriptions.push({
          id: channelId,
          name: item.snippet.title,
          displayName: item.snippet.title,
          url: `https://www.youtube.com/channel/${channelId}`,
          subscriberCount: channelStats.get(channelId),
          description: item.snippet.description,
          platform: 'youtube',
          thumbnailUrl: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
        });
      }

      nextPageToken = data.nextPageToken;

      // Rate limiting: YouTube API allows 100 requests per minute
      if (nextPageToken) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (nextPageToken);

    return subscriptions;
  }

  async function subscribe(accessToken: string, channelId: string): Promise<TransferResult> {
    try {
      console.log(`YouTube: Attempting to subscribe to channel: ${channelId}`);
      
      const response = await fetch("https://www.googleapis.com/youtube/v3/subscriptions?part=snippet", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snippet: {
            resourceId: {
              kind: "youtube#channel",
              channelId: channelId,
            },
          },
        }),
      });

      console.log(`YouTube: Subscribe response status for ${channelId}: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`YouTube: Subscribe error for ${channelId}:`, errorText);

        // Parse JSON error response
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = null;
        }

        if (response.status === 400) {
          // Check if it's already subscribed
          if (errorText.includes("subscriptionDuplicate") || 
              errorData?.error?.errors?.[0]?.reason === "subscriptionDuplicate") {
            return {
              targetId: channelId,
              targetName: channelId,
              success: true,
              alreadyExists: true,
            };
          }
          return {
            targetId: channelId,
            targetName: channelId,
            success: false,
            error: errorData?.error?.message || "Bad request",
          };
        } else if (response.status === 403) {
          // Check for quota exceeded
          if (errorText.includes("quotaExceeded") || 
              errorData?.error?.errors?.[0]?.reason === "quotaExceeded") {
            return {
              targetId: channelId,
              targetName: channelId,
              success: false,
              error: "YouTube API quota exceeded. Please wait 24 hours before trying again.",
            };
          }
          return {
            targetId: channelId,
            targetName: channelId,
            success: false,
            error: "Access denied - unable to subscribe",
          };
        } else if (response.status === 404) {
          return {
            targetId: channelId,
            targetName: channelId,
            success: false,
            error: "Channel not found",
          };
        }

        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json() as any;
      return {
        targetId: channelId,
        targetName: result.snippet?.title || channelId,
        success: true,
      };
    } catch (error) {
      console.error(`YouTube subscribe error for ${channelId}:`, error);
      return {
        targetId: channelId,
        targetName: channelId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async function unsubscribe(accessToken: string, channelId: string): Promise<TransferResult> {
    try {
      // First, get the subscription ID for this channel
      const subscriptionsUrl = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
      subscriptionsUrl.searchParams.set("part", "id,snippet");
      subscriptionsUrl.searchParams.set("forChannelId", channelId);
      subscriptionsUrl.searchParams.set("mine", "true");

      const getResponse = await fetch(subscriptionsUrl.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!getResponse.ok) {
        throw new Error(`Failed to find subscription: ${getResponse.status}`);
      }

      const subscriptionData = (await getResponse.json()) as YouTubeSubscriptionsResponse;
      
      if (!subscriptionData.items || subscriptionData.items.length === 0) {
        return {
          targetId: channelId,
          targetName: channelId,
          success: true,
          alreadyExists: false, // Not subscribed
        };
      }

      const subscriptionId = subscriptionData.items[0]?.id;
      const channelName = subscriptionData.items[0]?.snippet?.title;

      // Now delete the subscription
      const deleteResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/subscriptions?id=${subscriptionId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();

        if (deleteResponse.status === 403) {
          return {
            targetId: channelId,
            targetName: channelName || channelId,
            success: false,
            error: "Access denied - unable to unsubscribe",
          };
        } else if (deleteResponse.status === 404) {
          return {
            targetId: channelId,
            targetName: channelName || channelId,
            success: false,
            error: "Subscription not found",
          };
        }

        throw new Error(`HTTP ${deleteResponse.status}: ${errorText}`);
      }

      return {
        targetId: channelId,
        targetName: channelName || channelId,
        success: true,
      };
    } catch (error) {
      return {
        targetId: channelId,
        targetName: channelId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async function checkSubscriptionStatus(accessToken: string, channelId: string): Promise<boolean> {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
      url.searchParams.set("part", "id");
      url.searchParams.set("forChannelId", channelId);
      url.searchParams.set("mine", "true");

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as YouTubeSubscriptionsResponse;
      return data.items && data.items.length > 0;
    } catch (error) {
      return false;
    }
  }

  return {
    getSubscriptions,
    subscribe,
    unsubscribe,
    checkSubscriptionStatus,
  };
}