import type { PlatformTokens, PlatformAccount, AuthUrlParams } from '../types';
import { getPlatformConfig } from '../../config/platforms';

interface GoogleTokenResponse extends PlatformTokens {
  scope: string;
}

interface GoogleUserInfo {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  email: string;
  email_verified: boolean;
}

interface YouTubeChannelResponse {
  items: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      customUrl?: string;
      thumbnails: {
        default: { url: string };
        medium: { url: string };
        high: { url: string };
      };
    };
  }>;
}

export function createYouTubeOAuth() {
  const config = getPlatformConfig('youtube');

  function getAuthUrl() {
    const state = crypto.randomUUID();
    const params = {
      client_id: config.clientId || '',
      response_type: "code",
      state,
      redirect_uri: config.redirectUri || '',
      scope: config.scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
    };

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(params)}`;
    console.log('YouTube OAuth URL generated with client_id:', config.clientId);
    console.log('Full OAuth URL:', authUrl);
    return { authUrl, state };
  }

  async function exchangeCodeForTokens(code: string): Promise<PlatformTokens> {
    const params = {
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri || '',
      client_id: config.clientId || '',
      client_secret: config.clientSecret || '',
    };
    
    console.log('YouTube OAuth exchange params:', {
      ...params,
      client_secret: '[REDACTED]',
      code: '[REDACTED]'
    });
    
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OAuth token exchange failed: ${error}`);
    }

    const tokens = (await response.json()) as GoogleTokenResponse;
    // console.log('YouTube token exchange successful, received:', {
    //   has_access_token: !!tokens.access_token,
    //   token_type: tokens.token_type,
    //   expires_in: tokens.expires_in
    // });
    
    return tokens;
  }

  async function refreshAccessToken(refreshToken: string): Promise<PlatformTokens> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId || '',
        client_secret: config.clientSecret || '',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    return (await response.json()) as GoogleTokenResponse;
  }

  async function getUserInfo(accessToken: string): Promise<PlatformAccount> {
    console.log('YouTube getUserInfo called with token:', accessToken ? `${accessToken.substring(0, 10)}...` : 'NO_TOKEN');
    
    // First get basic user info from Google
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      const error = await userResponse.text();
      throw new Error(`Failed to get user info: ${error}`);
    }

    const userInfo = (await userResponse.json()) as GoogleUserInfo;

    // Get YouTube channel info to get the channel handle/custom URL
    const channelResponse = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    let username = userInfo.email; // fallback to email
    let displayName = userInfo.name;

    if (channelResponse.ok) {
      const channelData = (await channelResponse.json()) as YouTubeChannelResponse;
      if (channelData.items && channelData.items.length > 0) {
        const channel = channelData.items[0];
        username = channel?.snippet?.customUrl || channel?.id || username;
        displayName = channel?.snippet?.title || displayName;
      }
    }

    return {
      username,
      displayName,
      accessToken,
      refreshToken: '', // Will be set by caller
      expiresAt: new Date(), // Will be set by caller
      platform: 'youtube'
    };
  }

  return {
    getAuthUrl,
    exchangeCodeForTokens,
    refreshAccessToken,
    getUserInfo,
  };
}