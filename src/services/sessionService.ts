import type { Session, Account } from '../auth/session';
import type { PlatformType } from '../platforms/types';

export interface SessionService {
  createSession(): Session;
  getSession(sessionId: string): Session | null;
  updateSession(sessionId: string, updates: Partial<Session>): void;
  setAccount(sessionId: string, accountType: 'source' | 'target', account: Account): void;
  setPlatform(sessionId: string, accountType: 'source' | 'target', platform: PlatformType): void;
  deleteSession(sessionId: string): void;
}

export class InMemorySessionService implements SessionService {
  private sessions = new Map<string, Session>();

  createSession(): Session {
    const sessionId = crypto.randomUUID();
    const session: Session = {
      id: sessionId,
      accounts: {
        source: null,
        target: null,
      },
      selectedPlatforms: {
        source: null,
        target: null,
      },
      createdAt: new Date()
    };
    
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }

  updateSession(sessionId: string, updates: Partial<Session>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
    }
  }

  setAccount(sessionId: string, accountType: 'source' | 'target', account: Account): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.accounts[accountType] = account;
      session.selectedPlatforms[accountType] = account.platform;
    }
  }

  setPlatform(sessionId: string, accountType: 'source' | 'target', platform: PlatformType): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.selectedPlatforms[accountType] = platform;
    }
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}