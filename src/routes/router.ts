import type { Session } from '../auth/session';
import type { PlatformType } from '../platforms/types';
import type { SessionService } from '../services/sessionService';
import type { OAuthService } from '../services/oauthService';
import type { TransferService } from '../services/transferService';
import { createPlatformProvider } from '../platforms/factory';
import { getEnabledPlatforms, isPlatformEnabled } from '../config/platforms';

export interface RouterDependencies {
  sessionService: SessionService;
  oauthService: OAuthService;
  transferService: TransferService;
}

export class AppRouter {
  constructor(private deps: RouterDependencies) {}

  async route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    
    // Handle static files
    if (url.pathname.startsWith('/static/')) {
      const filePath = './src' + url.pathname;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
      return new Response('Not Found', { status: 404 });
    }

    // Get or create session
    const { session, sessionId, isNewSession } = this.getOrCreateSession(req);

    // Route handling
    let response: Response;
    
    switch (url.pathname) {
      case '/':
        response = await this.handleHome();
        break;
      
      case '/auth/login':
        response = await this.handleLogin(req, session);
        break;
      
      case '/auth/callback':
        response = await this.handleCallback(req, session);
        break;
      
      case '/api/platforms':
        response = await this.handleGetPlatforms();
        break;
      
      case '/api/subscriptions':
        response = await this.handleGetSubscriptions(req, session);
        break;
      
      case '/api/transfer':
        if (req.method === 'POST') {
          response = await this.handleTransfer(req, session);
        } else {
          response = new Response('Method Not Allowed', { status: 405 });
        }
        break;
      
      case '/api/clear-all':
        if (req.method === 'POST') {
          response = await this.handleClearAll(req, session);
        } else {
          response = new Response('Method Not Allowed', { status: 405 });
        }
        break;
      
      case '/api/status':
        response = await this.handleStatus(session);
        break;
      
      case '/api/saved-posts/export':
        if (req.method === 'POST') {
          response = await this.handleExportSavedPosts(req, session);
        } else {
          response = new Response('Method Not Allowed', { status: 405 });
        }
        break;
      
      default:
        // Handle dynamic transfer status routes
        if (url.pathname.startsWith('/api/transfer/')) {
          const transferId = url.pathname.split('/')[3];
          if (transferId) {
            response = await this.handleTransferStatus(transferId);
          } else {
            response = new Response('Not Found', { status: 404 });
          }
        } else {
          response = new Response('Not Found', { status: 404 });
        }
    }

    return this.addSessionCookie(response, sessionId);
  }

  private getOrCreateSession(req: Request): { session: Session; sessionId: string; isNewSession: boolean } {
    const cookies = req.headers.get('cookie') || '';
    const sessionMatch = cookies.match(/sessionId=([^;]+)/);
    let sessionId = sessionMatch?.[1];
    let isNewSession = false;
    
    if (!sessionId) {
      const session = this.deps.sessionService.createSession();
      sessionId = session.id;
      isNewSession = true;
      return { session, sessionId, isNewSession };
    }

    let session = this.deps.sessionService.getSession(sessionId);
    if (!session) {
      session = this.deps.sessionService.createSession();
      sessionId = session.id;
      isNewSession = true;
    }

    return { session, sessionId, isNewSession };
  }

  private addSessionCookie(response: Response, sessionId: string): Response {
    const headers = new Headers(response.headers);
    headers.set('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  private async handleHome(): Promise<Response> {
    const html = await Bun.file('./src/static/index.html').text();
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  private async handleGetPlatforms(): Promise<Response> {
    const enabledPlatforms = getEnabledPlatforms();
    return new Response(JSON.stringify({
      platforms: enabledPlatforms.map(platform => ({
        id: platform,
        name: platform.charAt(0).toUpperCase() + platform.slice(1),
        enabled: true
      }))
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleLogin(req: Request, session: Session): Promise<Response> {
    const url = new URL(req.url);
    const accountType = url.searchParams.get('type') as 'source' | 'target';
    const platform = url.searchParams.get('platform') as PlatformType;
    
    if (!accountType || !['source', 'target'].includes(accountType)) {
      return new Response('Invalid account type', { status: 400 });
    }

    if (!platform || !isPlatformEnabled(platform)) {
      return new Response('Invalid or disabled platform', { status: 400 });
    }

    try {
      const provider = createPlatformProvider(platform);
      const { authUrl, state } = provider.getAuthUrl();
      
      this.deps.oauthService.setPendingOAuth(state, {
        accountType,
        sessionId: session.id,
        platform
      });
      
      return Response.redirect(authUrl);
    } catch (error) {
      console.error('Login error:', error);
      return new Response('Platform configuration error', { status: 500 });
    }
  }

  private async handleCallback(req: Request, session: Session): Promise<Response> {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    
    if (!code || !state) {
      return new Response('Missing OAuth parameters', { status: 400 });
    }

    const pending = this.deps.oauthService.getPendingOAuth(state);
    if (!pending || pending.sessionId !== session.id) {
      return new Response('Invalid OAuth state', { status: 400 });
    }

    try {
      const provider = createPlatformProvider(pending.platform);
      const tokens = await provider.exchangeCodeForTokens(code);
      const userInfo = await provider.getUserInfo(tokens.access_token);
      
      const account = {
        username: userInfo.username,
        displayName: userInfo.displayName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        platform: pending.platform
      };

      this.deps.sessionService.setAccount(session.id, pending.accountType, account);
      this.deps.oauthService.deletePendingOAuth(state);
      
      return Response.redirect('/');
    } catch (error) {
      console.error('OAuth callback error:', error);
      return new Response('OAuth error', { status: 500 });
    }
  }

  private async handleGetSubscriptions(req: Request, session: Session): Promise<Response> {
    if (!session.accounts.source) {
      return new Response(JSON.stringify({ error: 'Source account not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const provider = createPlatformProvider(session.accounts.source.platform);
      const subscriptions = await provider.getSubscriptions(session.accounts.source.accessToken);
      return new Response(JSON.stringify(subscriptions), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Get subscriptions error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check for quota exceeded errors
      if (errorMessage.includes('quota exceeded') || errorMessage.includes('quotaExceeded')) {
        return new Response(JSON.stringify({ 
          error: 'quota_exceeded',
          message: errorMessage
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Check for authentication errors
      if (errorMessage.includes('Access token expired') || errorMessage.includes('invalid')) {
        return new Response(JSON.stringify({ 
          error: 'auth_expired',
          message: 'Authentication expired. Please reconnect your account.'
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ error: 'Failed to fetch subscriptions' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleTransfer(req: Request, session: Session): Promise<Response> {
    if (!session.accounts.source || !session.accounts.target) {
      return new Response(JSON.stringify({ error: 'Both accounts must be authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const body = await req.json() as { 
        subscriptions: string[];
        transferSavedPosts?: boolean;
        savedPostsData?: any;
      };
      const { subscriptions, transferSavedPosts, savedPostsData } = body;
      
      if (!Array.isArray(subscriptions)) {
        return new Response(JSON.stringify({ error: 'Invalid subscriptions list' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const transferId = this.deps.transferService.startTransfer(
        session.accounts.source,
        session.accounts.target,
        subscriptions,
        { transferSavedPosts, savedPostsData }
      );
      
      return new Response(JSON.stringify({ transferId, status: 'started' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Transfer error:', error);
      return new Response(JSON.stringify({ error: 'Failed to start transfer' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleStatus(session: Session): Promise<Response> {
    return new Response(JSON.stringify({
      sourceAccount: session.accounts.source ? {
        username: session.accounts.source.username,
        displayName: session.accounts.source.displayName,
        platform: session.accounts.source.platform,
        authenticated: true
      } : null,
      targetAccount: session.accounts.target ? {
        username: session.accounts.target.username,
        displayName: session.accounts.target.displayName,
        platform: session.accounts.target.platform,
        authenticated: true
      } : null,
      selectedPlatforms: session.selectedPlatforms,
      enabledPlatforms: getEnabledPlatforms()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleClearAll(req: Request, session: Session): Promise<Response> {
    if (!session.accounts.target) {
      return new Response(JSON.stringify({ error: 'Target account not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const transferId = await this.deps.transferService.clearAllSubscriptions(session.accounts.target);
      
      return new Response(JSON.stringify({ transferId, status: 'started' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Clear all error:', error);
      return new Response(JSON.stringify({ error: 'Failed to start clear all' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleTransferStatus(transferId: string): Promise<Response> {
    try {
      const status = this.deps.transferService.getTransferStatus(transferId);
      if (!status) {
        return new Response(JSON.stringify({ error: 'Transfer not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify(status), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Transfer status error:', error);
      return new Response(JSON.stringify({ error: 'Failed to get transfer status' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleExportSavedPosts(req: Request, session: Session): Promise<Response> {
    if (!session.accounts.source) {
      return new Response(JSON.stringify({ error: 'Source account not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const provider = createPlatformProvider(session.accounts.source.platform);
      
      if (!provider.getContent) {
        return new Response(JSON.stringify({ error: 'Content export not supported for this platform' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const content = await provider.getContent(
        session.accounts.source.accessToken,
        session.accounts.source.username
      );
      
      const exportData = {
        version: "2.0",
        platform: session.accounts.source.platform,
        exportedAt: new Date().toISOString(),
        username: session.accounts.source.username,
        content: content
      };
      
      const filename = `${session.accounts.source.platform}-content-${session.accounts.source.username}-${new Date().toISOString().split('T')[0]}.json`;
      
      return new Response(JSON.stringify(exportData), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    } catch (error) {
      console.error('Export content error:', error);
      return new Response(JSON.stringify({ error: 'Failed to export content' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}