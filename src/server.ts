import type { Session } from './auth/session';
import { createRedditOAuth } from './auth/reddit-oauth';
import { createSubscriptionAPI } from './api/subscriptions';
import { createTransferAPI } from './api/transfer';
import { createSavedPostsAPI } from './api/savedPosts';

declare global {
  namespace Bun {
    interface Env {
      REDDIT_CLIENT_ID: string;
      REDDIT_CLIENT_SECRET: string;
      REDDIT_REDIRECT_URI: string;
      PORT?: string;
      SESSION_SECRET: string;
      NODE_ENV?: string;
    }
  }
}

interface AppContext {
  sessions: Map<string, Session>;
  pendingOAuth: Map<string, { accountType: 'source' | 'target'; sessionId: string }>;
}

const ctx: AppContext = {
  sessions: new Map(),
  pendingOAuth: new Map()
};

const redditOAuth = createRedditOAuth();
const subscriptionAPI = createSubscriptionAPI();
const transferAPI = createTransferAPI();
const savedPostsAPI = createSavedPostsAPI();

function addSessionCookie(response: Response, sessionId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
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
        sourceAccount: null,
        targetAccount: null,
        createdAt: new Date()
      });
    }

    let session = ctx.sessions.get(sessionId);
    if (!session) {
      // Recreate session if it doesn't exist
      session = {
        id: sessionId,
        sourceAccount: null,
        targetAccount: null,
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

async function handleLogin(req: Request, session: Session, ctx: AppContext) {
  const url = new URL(req.url);
  const accountType = url.searchParams.get('type') as 'source' | 'target';
  
  if (!accountType || !['source', 'target'].includes(accountType)) {
    return new Response('Invalid account type', { status: 400 });
  }

  const { authUrl, state } = redditOAuth.getAuthUrl();
  ctx.pendingOAuth.set(state, { accountType, sessionId: session.id });
  
  return Response.redirect(authUrl);
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
    const tokens = await redditOAuth.exchangeCodeForTokens(code);
    const userInfo = await redditOAuth.getUserInfo(tokens.access_token);
    
    const account = {
      username: userInfo.name,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000)
    };

    if (pending.accountType === 'source') {
      session.sourceAccount = account;
    } else {
      session.targetAccount = account;
    }

    ctx.pendingOAuth.delete(state);
    
    return Response.redirect('/');
  } catch (error) {
    console.error('OAuth callback error:', error);
    return new Response('OAuth error', { status: 500 });
  }
}

async function handleGetSubscriptions(req: Request, session: Session) {
  if (!session.sourceAccount) {
    return new Response(JSON.stringify({ error: 'Source account not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const subscriptions = await subscriptionAPI.getSubscriptions(session.sourceAccount.accessToken);
    return new Response(JSON.stringify(subscriptions), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch subscriptions' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleTransfer(req: Request, session: Session) {
  if (!session.sourceAccount || !session.targetAccount) {
    return new Response(JSON.stringify({ error: 'Both accounts must be authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json() as { 
      subreddits: string[];
      transferSavedPosts?: boolean;
      savedPostsData?: any;
    };
    const { subreddits, transferSavedPosts, savedPostsData } = body;
    
    if (!Array.isArray(subreddits)) {
      return new Response(JSON.stringify({ error: 'Invalid subreddits list' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const transferId = crypto.randomUUID();
    transferAPI.startTransfer(
      transferId, 
      session.targetAccount.accessToken, 
      subreddits, 
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
    sourceAccount: session.sourceAccount ? {
      username: session.sourceAccount.username,
      authenticated: true
    } : null,
    targetAccount: session.targetAccount ? {
      username: session.targetAccount.username,
      authenticated: true
    } : null
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleClearAll(req: Request, session: Session) {
  if (!session.targetAccount) {
    return new Response(JSON.stringify({ error: 'Target account not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const transferId = await transferAPI.clearAllSubscriptions(session.targetAccount.accessToken);
    
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
    const status = transferAPI.getTransferStatus(transferId);
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
  if (!session.sourceAccount) {
    return new Response(JSON.stringify({ error: 'Source account not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const exportData = await savedPostsAPI.exportSavedPosts(
      session.sourceAccount.accessToken,
      session.sourceAccount.username
    );
    
    const filename = `reddit-saved-posts-${session.sourceAccount.username}-${new Date().toISOString().split('T')[0]}.json`;
    
    return new Response(JSON.stringify(exportData), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    console.error('Export saved posts error:', error);
    return new Response(JSON.stringify({ error: 'Failed to export saved posts' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

console.log(`Server running on http://localhost:${server.port}`);