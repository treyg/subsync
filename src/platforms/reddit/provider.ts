import type { PlatformProvider, PlatformTokens, PlatformAccount, PlatformSubscription, TransferResult, PlatformContent } from '../types';
import { createRedditOAuth } from './oauth';
import { createRedditSubscriptions } from './subscriptions';
import { createRedditSavedPosts } from './savedPosts';

export function createRedditProvider(): PlatformProvider {
  const oauth = createRedditOAuth();
  const subscriptions = createRedditSubscriptions();
  const savedPosts = createRedditSavedPosts();

  return {
    name: 'reddit',
    platform: 'reddit',

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

    async getContent(accessToken: string, username?: string): Promise<PlatformContent[]> {
      return savedPosts.getSavedPosts(accessToken, username);
    },

    async saveContent(accessToken: string, contentId: string): Promise<TransferResult> {
      return savedPosts.savePost(accessToken, contentId);
    },
  };
}