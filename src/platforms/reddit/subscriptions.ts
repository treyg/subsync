import type { PlatformSubscription, TransferResult } from '../types';

interface RedditSubreddit {
  display_name: string;
  url: string;
  subscribers: number;
  public_description: string;
  over18: boolean;
  icon_img?: string;
  community_icon?: string;
}

interface RedditListingResponse {
  data: {
    children: Array<{
      data: RedditSubreddit;
    }>;
    after: string | null;
    before: string | null;
  };
}

export function createRedditSubscriptions() {
  async function getSubscriptions(accessToken: string): Promise<PlatformSubscription[]> {
    const subscriptions: PlatformSubscription[] = [];
    let after: string | null = null;

    do {
      const url = new URL("https://oauth.reddit.com/subreddits/mine/subscriber");
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
        if (response.status === 401) {
          throw new Error("Access token expired or invalid");
        }
        const error = await response.text();
        throw new Error(`Failed to fetch subscriptions: ${error}`);
      }

      const data = (await response.json()) as RedditListingResponse;

      for (const child of data.data.children) {
        const subreddit = child.data;
        subscriptions.push({
          id: subreddit.display_name,
          name: subreddit.display_name,
          displayName: `r/${subreddit.display_name}`,
          url: `https://reddit.com${subreddit.url}`,
          subscriberCount: subreddit.subscribers,
          description: subreddit.public_description,
          platform: 'reddit',
          thumbnailUrl: subreddit.icon_img || subreddit.community_icon || undefined,
        });
      }

      after = data.data.after;

      if (after) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (after);

    return subscriptions;
  }

  async function subscribe(accessToken: string, subredditName: string): Promise<TransferResult> {
    try {
      // First, check if already subscribed
      const isAlreadySubscribed = await checkSubscriptionStatus(accessToken, subredditName);
      console.log(`Checking subscription status for r/${subredditName}: ${isAlreadySubscribed}`);
      
      if (isAlreadySubscribed) {
        console.log(`Already subscribed to r/${subredditName}, returning alreadyExists: true`);
        return {
          targetId: subredditName,
          targetName: `r/${subredditName}`,
          success: true,
          alreadyExists: true,
        };
      }

      console.log(`Not subscribed to r/${subredditName}, proceeding with subscription`);
      const response = await fetch("https://oauth.reddit.com/api/subscribe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "subsync-app/1.0.0",
        },
        body: new URLSearchParams({
          action: "sub",
          sr_name: subredditName,
          skip_initial_defaults: "true",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Subscribe API error for r/${subredditName}: ${response.status} - ${errorText}`);

        if (response.status === 403) {
          return {
            targetId: subredditName,
            targetName: `r/${subredditName}`,
            success: false,
            error: "Access denied - private subreddit or banned user",
          };
        } else if (response.status === 404) {
          return {
            targetId: subredditName,
            targetName: `r/${subredditName}`,
            success: false,
            error: "Subreddit not found or deleted",
          };
        } else if (
          response.status === 400 &&
          errorText.includes("already_subscribed")
        ) {
          console.log(`Got already_subscribed error for r/${subredditName}`);
          return {
            targetId: subredditName,
            targetName: `r/${subredditName}`,
            success: true,
            alreadyExists: true,
          };
        }

        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      console.log(`Successfully subscribed to r/${subredditName}`);
      return {
        targetId: subredditName,
        targetName: `r/${subredditName}`,
        success: true,
      };
    } catch (error) {
      console.error(`Error subscribing to r/${subredditName}:`, error);
      return {
        targetId: subredditName,
        targetName: `r/${subredditName}`,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async function unsubscribe(accessToken: string, subredditName: string): Promise<TransferResult> {
    try {
      const response = await fetch("https://oauth.reddit.com/api/subscribe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "subsync-app/1.0.0",
        },
        body: new URLSearchParams({
          action: "unsub",
          sr_name: subredditName,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 403) {
          return {
            targetId: subredditName,
            targetName: `r/${subredditName}`,
            success: false,
            error: "Access denied - unable to unsubscribe",
          };
        } else if (response.status === 404) {
          return {
            targetId: subredditName,
            targetName: `r/${subredditName}`,
            success: false,
            error: "Subreddit not found",
          };
        }
        
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return {
        targetId: subredditName,
        targetName: `r/${subredditName}`,
        success: true,
      };
    } catch (error) {
      return {
        targetId: subredditName,
        targetName: `r/${subredditName}`,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async function checkSubscriptionStatus(accessToken: string, subredditName: string): Promise<boolean> {
    try {
      const response = await fetch(
        `https://oauth.reddit.com/r/${subredditName}/about`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": "subsync-app/1.0.0",
          },
        }
      );

      if (!response.ok) {
        console.log(`checkSubscriptionStatus API error for r/${subredditName}: ${response.status}`);
        return false;
      }

      const data = (await response.json()) as {
        data?: { user_is_subscriber?: boolean };
      };
      
      const isSubscribed = data.data?.user_is_subscriber === true;
      console.log(`checkSubscriptionStatus for r/${subredditName}: user_is_subscriber = ${data.data?.user_is_subscriber}, returning ${isSubscribed}`);
      return isSubscribed;
    } catch (error) {
      console.error(`checkSubscriptionStatus error for r/${subredditName}:`, error);
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