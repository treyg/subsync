import { initializePlatforms } from './platforms/factory';
import { AppRouter } from './routes/router';
import { InMemorySessionService } from './services/sessionService';
import { InMemoryOAuthService } from './services/oauthService';
import { MultiPlatformTransferService } from './services/transferService';
import { getEnabledPlatforms } from './config/platforms';

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

// Initialize platforms
await initializePlatforms();

// Initialize services
const sessionService = new InMemorySessionService();
const oauthService = new InMemoryOAuthService();
const transferService = new MultiPlatformTransferService();

// Initialize router with dependencies
const router = new AppRouter({
  sessionService,
  oauthService,
  transferService
});

// Create and start server
const server = Bun.serve({
  port: process.env.PORT || 3000,
  fetch: async (req): Promise<Response> => {
    return router.route(req);
  }
});

console.log(`Server running on http://localhost:${server.port}`);
console.log(`Enabled platforms: ${getEnabledPlatforms().join(', ')}`);