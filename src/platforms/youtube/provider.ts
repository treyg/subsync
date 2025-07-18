import type {
  PlatformProvider,
  PlatformTokens,
  PlatformAccount,
  PlatformSubscription,
  TransferResult,
} from "../types";
import { createYouTubeOAuth } from "./oauth";
import { createYouTubeSubscriptions } from "./subscriptions";

export function createYouTubeProvider(): PlatformProvider {
  const oauth = createYouTubeOAuth();
  const subscriptions = createYouTubeSubscriptions();

  return {
    name: "youtube",
    platform: "youtube",

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

    async getSubscriptions(
      accessToken: string
    ): Promise<PlatformSubscription[]> {
      return subscriptions.getSubscriptions(accessToken);
    },

    async subscribe(
      accessToken: string,
      targetId: string
    ): Promise<TransferResult> {
      return subscriptions.subscribe(accessToken, targetId);
    },

    async unsubscribe(
      accessToken: string,
      targetId: string
    ): Promise<TransferResult> {
      return subscriptions.unsubscribe(accessToken, targetId);
    },

    async checkSubscriptionStatus(
      accessToken: string,
      targetId: string
    ): Promise<boolean> {
      return subscriptions.checkSubscriptionStatus(accessToken, targetId);
    },
  };
}
