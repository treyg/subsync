interface RedditSubreddit {
  display_name: string;
  url: string;
  subscribers: number;
  public_description: string;
  over18: boolean;
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

export function createSubscriptionAPI() {
  async function getSubscriptions(
    accessToken: string
  ): Promise<RedditSubreddit[]> {
    const subscriptions: RedditSubreddit[] = [];
    let after: string | null = null;

    do {
      const url = new URL(
        "https://oauth.reddit.com/subreddits/mine/subscriber"
      );
      url.searchParams.set("limit", "100");
      if (after) {
        url.searchParams.set("after", after);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "reddit-transfer-app/1.0.0",
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
        subscriptions.push(child.data);
      }

      after = data.data.after;

      // Rate limiting: Reddit allows 100 requests per minute
      if (after) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (after);

    return subscriptions;
  }

  async function checkSubscriptionStatus(
    accessToken: string,
    subredditName: string
  ): Promise<boolean> {
    const response = await fetch(
      `https://oauth.reddit.com/r/${subredditName}/about`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "reddit-transfer-app/1.0.0",
        },
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as {
      data?: { user_is_subscriber?: boolean };
    };
    return data.data?.user_is_subscriber === true;
  }

  return {
    getSubscriptions,
    checkSubscriptionStatus,
  };
}
