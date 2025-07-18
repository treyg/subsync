import type { PlatformTokens, PlatformAccount, AuthUrlParams } from '../types';
import { getPlatformConfig } from '../../config/platforms';

interface RedditUser {
  name: string;
  id: string;
}

export function createRedditOAuth() {
  const config = getPlatformConfig('reddit');

  function getAuthUrl() {
    const state = crypto.randomUUID();
    const params = {
      client_id: config.clientId || '',
      response_type: "code",
      state,
      redirect_uri: config.redirectUri || '',
      duration: "permanent",
      scope: config.scopes.join(" "),
    };

    const authUrl = `${config.baseUrl}/api/v1/authorize?${new URLSearchParams(params)}`;
    return { authUrl, state };
  }

  async function exchangeCodeForTokens(code: string): Promise<PlatformTokens> {
    const auth = btoa(`${config.clientId}:${config.clientSecret}`);

    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "subsync-app/1.0.0",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri || '',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OAuth token exchange failed: ${error}`);
    }

    return (await response.json()) as PlatformTokens;
  }

  async function refreshAccessToken(refreshToken: string): Promise<PlatformTokens> {
    const auth = btoa(`${config.clientId}:${config.clientSecret}`);

    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "subsync-app/1.0.0",
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

    return (await response.json()) as PlatformTokens;
  }

  async function getUserInfo(accessToken: string): Promise<PlatformAccount> {
    const response = await fetch("https://oauth.reddit.com/api/v1/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "subsync-app/1.0.0",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get user info: ${error}`);
    }

    const user = (await response.json()) as RedditUser;
    
    return {
      username: user.name,
      displayName: user.name,
      accessToken,
      refreshToken: '', // Will be set by caller
      expiresAt: new Date(), // Will be set by caller
      platform: 'reddit'
    };
  }

  return {
    getAuthUrl,
    exchangeCodeForTokens,
    refreshAccessToken,
    getUserInfo,
  };
}