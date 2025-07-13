export interface RedditAccount {
  username: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface Session {
  id: string;
  sourceAccount: RedditAccount | null;
  targetAccount: RedditAccount | null;
  createdAt: Date;
}
