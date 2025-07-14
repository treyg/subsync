import type { PlatformProvider, PlatformTokens, PlatformAccount, PlatformSubscription, TransferResult, PlatformContent } from '../types';
import { createYouTubeOAuth } from './oauth';
import { createYouTubeSubscriptions } from './subscriptions';
import { createYouTubePlaylists } from './playlists';

export function createYouTubeProvider(): PlatformProvider {
  const oauth = createYouTubeOAuth();
  const subscriptions = createYouTubeSubscriptions();
  const playlists = createYouTubePlaylists();

  return {
    name: 'youtube',
    platform: 'youtube',

    getAuthUrl() {
      return oauth.getAuthUrl();
    },

    async exchangeCodeForTokens(code: string): Promise<PlatformTokens> {
      return oauth.exchangeCodeForTokens(code);
    },

    async refreshAccessToken(refreshToken: string): Promise<PlatformTokens> {
      return oauth.refreshAccessToken(refreshToken);
    },

    async getUserInfo(accessToken: string): Promise<PlatformAccount> {
      return oauth.getUserInfo(accessToken);
    },

    async getSubscriptions(accessToken: string): Promise<PlatformSubscription[]> {
      return subscriptions.getSubscriptions(accessToken);
    },

    async subscribe(accessToken: string, targetId: string): Promise<TransferResult> {
      return subscriptions.subscribe(accessToken, targetId);
    },

    async unsubscribe(accessToken: string, targetId: string): Promise<TransferResult> {
      return subscriptions.unsubscribe(accessToken, targetId);
    },

    async checkSubscriptionStatus(accessToken: string, targetId: string): Promise<boolean> {
      return subscriptions.checkSubscriptionStatus(accessToken, targetId);
    },

    async getContent(accessToken: string): Promise<PlatformContent[]> {
      return playlists.getUserPlaylists(accessToken);
    },

    async saveContent(accessToken: string, contentId: string): Promise<TransferResult> {
      // For YouTube, this could create a playlist or add to an existing one
      // For now, we'll implement basic playlist creation
      return playlists.createPlaylist(accessToken, `Imported Playlist ${Date.now()}`);
    },
  };
}