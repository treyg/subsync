import type { PlatformType } from '../platforms/types';

export interface OAuthState {
  accountType: 'source' | 'target';
  sessionId: string;
  platform: PlatformType;
}

export interface OAuthService {
  setPendingOAuth(state: string, oauthState: OAuthState): void;
  getPendingOAuth(state: string): OAuthState | null;
  deletePendingOAuth(state: string): void;
}

export class InMemoryOAuthService implements OAuthService {
  private pendingOAuth = new Map<string, OAuthState>();

  setPendingOAuth(state: string, oauthState: OAuthState): void {
    this.pendingOAuth.set(state, oauthState);
  }

  getPendingOAuth(state: string): OAuthState | null {
    return this.pendingOAuth.get(state) || null;
  }

  deletePendingOAuth(state: string): void {
    this.pendingOAuth.delete(state);
  }
}