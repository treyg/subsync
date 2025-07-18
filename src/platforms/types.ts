export type PlatformType = 'reddit' | 'youtube';

export interface PlatformTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface PlatformAccount {
  username: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  platform: PlatformType;
}

export interface PlatformSubscription {
  id: string;
  name: string;
  displayName: string;
  url: string;
  subscriberCount?: number;
  description?: string;
  platform: PlatformType;
  thumbnailUrl?: string;
}

export interface PlatformContent {
  id: string;
  name: string;
  title: string;
  url: string;
  platform: PlatformType;
  type: 'post' | 'video' | 'playlist';
  createdAt: Date;
  author?: string;
}

export interface TransferResult {
  targetId: string;
  targetName: string;
  success: boolean;
  error?: string;
  alreadyExists?: boolean;
}

export interface PlatformProvider {
  readonly name: string;
  readonly platform: PlatformType;
  
  getAuthUrl(): { authUrl: string; state: string };
  exchangeCodeForTokens(code: string): Promise<PlatformTokens>;
  refreshAccessToken(refreshToken: string): Promise<PlatformTokens>;
  getUserInfo(accessToken: string): Promise<PlatformAccount>;
  
  getSubscriptions(accessToken: string): Promise<PlatformSubscription[]>;
  subscribe(accessToken: string, targetId: string): Promise<TransferResult>;
  unsubscribe(accessToken: string, targetId: string): Promise<TransferResult>;
  
  checkSubscriptionStatus?(accessToken: string, targetId: string): Promise<boolean>;
  getContent?(accessToken: string, username?: string): Promise<PlatformContent[]>;
  saveContent?(accessToken: string, contentId: string): Promise<TransferResult>;
}

export interface PlatformConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  baseUrl: string;
}

export interface AuthUrlParams {
  client_id: string;
  response_type: string;
  state: string;
  redirect_uri: string;
  scope: string;
  [key: string]: string;
}