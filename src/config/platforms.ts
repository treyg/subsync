import type { PlatformConfig, PlatformType } from '../platforms/types';

export function getPlatformConfig(platform: PlatformType): PlatformConfig {
  switch (platform) {
    case 'reddit':
      return {
        enabled: !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET),
        clientId: process.env.REDDIT_CLIENT_ID || '',
        clientSecret: process.env.REDDIT_CLIENT_SECRET || '',
        redirectUri: process.env.REDDIT_REDIRECT_URI || '',
        scopes: ['mysubreddits', 'subscribe', 'identity', 'history', 'save'],
        baseUrl: 'https://www.reddit.com'
      };
      
    case 'youtube':
      return {
        enabled: !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET),
        clientId: process.env.YOUTUBE_CLIENT_ID || '',
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
        redirectUri: process.env.YOUTUBE_REDIRECT_URI || '',
        scopes: ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/youtube.force-ssl', 'https://www.googleapis.com/auth/userinfo.profile'],
        baseUrl: 'https://www.googleapis.com'
      };
      
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

export function getEnabledPlatforms(): PlatformType[] {
  const platforms: PlatformType[] = ['reddit', 'youtube'];
  return platforms.filter(platform => getPlatformConfig(platform).enabled);
}

export function isPlatformEnabled(platform: PlatformType): boolean {
  return getPlatformConfig(platform).enabled;
}

export function validatePlatformConfig(platform: PlatformType): void {
  const config = getPlatformConfig(platform);
  
  if (!config.clientId) {
    throw new Error(`Missing ${platform.toUpperCase()}_CLIENT_ID environment variable`);
  }
  
  if (!config.clientSecret) {
    throw new Error(`Missing ${platform.toUpperCase()}_CLIENT_SECRET environment variable`);
  }
  
  if (!config.redirectUri) {
    throw new Error(`Missing ${platform.toUpperCase()}_REDIRECT_URI environment variable`);
  }
}