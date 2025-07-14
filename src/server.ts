import type { Session, Account, RedditAccount } from './auth/session';
import { accountToRedditAccount, redditAccountToAccount } from './auth/session';
import type { PlatformType } from './platforms/types';
import { initializePlatforms, createPlatformProvider } from './platforms/factory';
import { getEnabledPlatforms, isPlatformEnabled } from './config/platforms';

// Global transfer API instance
let globalTransferAPI: any = null;

declare global {
  namespace Bun {
    interface Env {
      REDDIT_CLIENT_ID?: string;
      REDDIT_CLIENT_SECRET?: string;
      REDDIT_REDIRECT_URI?: string;
      YOUTUBE_CLIENT_ID?: string;
      YOUTUBE_CLIENT_SECRET?: string;
      YOUTUBE_REDIRECT_URI?: string;
      PORT?: string;
      SESSION_SECRET: string;
      NODE_ENV?: string;
    }
  }
}

interface AppContext {
  sessions: Map<string, Session>;
  pendingOAuth: Map<string, { 
    accountType: 'source' | 'target'; 
    sessionId: string; 
    platform: PlatformType;
  }>;
}

const ctx: AppContext = {
  sessions: new Map(),
  pendingOAuth: new Map()
};

// Initialize platforms
await initializePlatforms();

function addSessionCookie(response: Response, sessionId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function createLegacySession(session: Session): any {
  // Convert new session format to legacy format for backward compatibility
  return {
    id: session.id,
    sourceAccount: accountToRedditAccount(session.accounts.source),
    targetAccount: accountToRedditAccount(session.accounts.target),
    createdAt: session.createdAt,
  };
}

const server = Bun.serve({
  port: process.env.PORT || 3000,
  fetch: async (req): Promise<Response> => {
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
    const cookies = req.headers.get('cookie') || '';
    const sessionMatch = cookies.match(/sessionId=([^;]+)/);
    let sessionId = sessionMatch?.[1];
    let isNewSession = false;
    
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      isNewSession = true;
      ctx.sessions.set(sessionId, {
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
      });
    }

    let session = ctx.sessions.get(sessionId);
    if (!session) {
      // Recreate session if it doesn't exist
      session = {
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
      ctx.sessions.set(sessionId, session);
    }

    // Route handling
    switch (url.pathname) {
      case '/':
        return addSessionCookie(await handleHome(session), sessionId);
      
      case '/auth/login':
        return addSessionCookie(await handleLogin(req, session, ctx), sessionId);
      
      case '/auth/callback':
        return await handleCallback(req, session, ctx);
      
      case '/api/platforms':
        return addSessionCookie(await handleGetPlatforms(), sessionId);
      
      case '/api/subscriptions':
        return addSessionCookie(await handleGetSubscriptions(req, session), sessionId);
      
      case '/api/transfer':
        if (req.method === 'POST') {
          return addSessionCookie(await handleTransfer(req, session), sessionId);
        }
        return new Response('Method Not Allowed', { status: 405 });
      
      case '/api/clear-all':
        if (req.method === 'POST') {
          return addSessionCookie(await handleClearAll(req, session), sessionId);
        }
        return new Response('Method Not Allowed', { status: 405 });
      
      case '/api/status':
        return addSessionCookie(await handleStatus(session), sessionId);
      
      case '/api/saved-posts/export':
        if (req.method === 'POST') {
          return addSessionCookie(await handleExportSavedPosts(req, session), sessionId);
        }
        return new Response('Method Not Allowed', { status: 405 });
      
      default:
        // Handle dynamic transfer status routes
        if (url.pathname.startsWith('/api/transfer/')) {
          const transferId = url.pathname.split('/')[3];
          if (transferId) {
            return addSessionCookie(await handleTransferStatus(transferId), sessionId);
          }
        }
        return new Response('Not Found', { status: 404 });
    }
  }
});

async function handleHome(session: Session) {
  const html = await Bun.file('./src/static/index.html').text();
  return new Response(html, {
    headers: { 
      'Content-Type': 'text/html'
    }
  });
}

async function handleGetPlatforms() {
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

async function handleLogin(req: Request, session: Session, ctx: AppContext) {
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
    ctx.pendingOAuth.set(state, { accountType, sessionId: session.id, platform });
    
    return Response.redirect(authUrl);
  } catch (error) {
    console.error('Login error:', error);
    return new Response('Platform configuration error', { status: 500 });
  }
}

async function handleCallback(req: Request, session: Session, ctx: AppContext) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  if (!code || !state) {
    return new Response('Missing OAuth parameters', { status: 400 });
  }

  const pending = ctx.pendingOAuth.get(state);
  if (!pending || pending.sessionId !== session.id) {
    return new Response('Invalid OAuth state', { status: 400 });
  }

  try {
    const provider = createPlatformProvider(pending.platform);
    const tokens = await provider.exchangeCodeForTokens(code);
    const userInfo = await provider.getUserInfo(tokens.access_token);
    
    const account: Account = {
      username: userInfo.username,
      displayName: userInfo.displayName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      platform: pending.platform
    };

    if (pending.accountType === 'source') {
      session.accounts.source = account;
      session.selectedPlatforms.source = pending.platform;
    } else {
      session.accounts.target = account;
      session.selectedPlatforms.target = pending.platform;
    }

    ctx.pendingOAuth.delete(state);
    
    return Response.redirect('/');
  } catch (error) {
    console.error('OAuth callback error:', error);
    return new Response('OAuth error', { status: 500 });
  }
}

async function handleGetSubscriptions(req: Request, session: Session) {
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

async function handleTransfer(req: Request, session: Session) {
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

    // Get or create the global transfer API instance
    if (!globalTransferAPI) {
      const { createMultiPlatformTransferAPI } = await import('./api/transfer');
      globalTransferAPI = createMultiPlatformTransferAPI();
    }

    const transferId = crypto.randomUUID();
    globalTransferAPI.startTransfer(
      transferId,
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

async function handleStatus(session: Session) {
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

async function handleClearAll(req: Request, session: Session) {
  if (!session.accounts.target) {
    return new Response(JSON.stringify({ error: 'Target account not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { createMultiPlatformTransferAPI } = await import('./api/transfer');
    const transferAPI = createMultiPlatformTransferAPI();
    const transferId = await transferAPI.clearAllSubscriptions(session.accounts.target);
    
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

async function handleTransferStatus(transferId: string) {
  try {
    // Use the global transfer API instance
    if (!globalTransferAPI) {
      const { createMultiPlatformTransferAPI } = await import('./api/transfer');
      globalTransferAPI = createMultiPlatformTransferAPI();
    }
    
    const status = globalTransferAPI.getTransferStatus(transferId);
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

async function handleExportSavedPosts(req: Request, session: Session) {
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

console.log(`Server running on http://localhost:${server.port}`);
console.log(`Enabled platforms: ${getEnabledPlatforms().join(', ')}`);