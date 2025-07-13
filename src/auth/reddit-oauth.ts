interface RedditTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface RedditUser {
  name: string;
  id: string;
}

export function createRedditOAuth() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const redirectUri = process.env.REDDIT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Reddit OAuth configuration");
  }

  function getAuthUrl() {
    const state = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      state,
      redirect_uri: redirectUri,
      duration: "permanent",
      scope: "mysubreddits subscribe identity",
    });

    return {
      authUrl: `https://www.reddit.com/api/v1/authorize?${params}`,
      state,
    };
  }

  async function exchangeCodeForTokens(code: string): Promise<RedditTokens> {
    const auth = btoa(`${clientId}:${clientSecret}`);

    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "reddit-transfer-app/1.0.0",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OAuth token exchange failed: ${error}`);
    }

    return (await response.json()) as RedditTokens;
  }

  async function refreshAccessToken(
    refreshToken: string
  ): Promise<RedditTokens> {
    const auth = btoa(`${clientId}:${clientSecret}`);

    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "reddit-transfer-app/1.0.0",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    return (await response.json()) as RedditTokens;
  }

  async function getUserInfo(accessToken: string): Promise<RedditUser> {
    const response = await fetch("https://oauth.reddit.com/api/v1/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "reddit-transfer-app/1.0.0",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get user info: ${error}`);
    }

    return (await response.json()) as RedditUser;
  }

  return {
    getAuthUrl,
    exchangeCodeForTokens,
    refreshAccessToken,
    getUserInfo,
  };
}
