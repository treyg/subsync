import type { PlatformType, PlatformAccount } from '../platforms/types';

export interface Account extends PlatformAccount {
  // Inherits all properties from PlatformAccount:
  // username, displayName, accessToken, refreshToken, expiresAt, platform
}

export interface Session {
  id: string;
  accounts: {
    source: Account | null;
    target: Account | null;
  };
  selectedPlatforms: {
    source: PlatformType | null;
    target: PlatformType | null;
  };
  createdAt: Date;
}

// Legacy interface for backward compatibility
export interface RedditAccount {
  username: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

// Helper functions for backward compatibility
export function accountToRedditAccount(account: Account | null): RedditAccount | null {
  if (!account || account.platform !== 'reddit') return null;
  return {
    username: account.username,
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    expiresAt: account.expiresAt,
  };
}

export function redditAccountToAccount(redditAccount: RedditAccount | null): Account | null {
  if (!redditAccount) return null;
  return {
    username: redditAccount.username,
    displayName: redditAccount.username,
    accessToken: redditAccount.accessToken,
    refreshToken: redditAccount.refreshToken,
    expiresAt: redditAccount.expiresAt,
    platform: 'reddit',
  };
}
