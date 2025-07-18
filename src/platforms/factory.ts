import type { PlatformProvider, PlatformType } from './types';

export class PlatformFactory {
  private static providers = new Map<PlatformType, () => PlatformProvider>();
  
  static register(platform: PlatformType, providerFactory: () => PlatformProvider) {
    this.providers.set(platform, providerFactory);
  }
  
  static create(platform: PlatformType): PlatformProvider {
    const factory = this.providers.get(platform);
    if (!factory) {
      throw new Error(`Platform provider not found: ${platform}`);
    }
    return factory();
  }
  
  static getAvailablePlatforms(): PlatformType[] {
    return Array.from(this.providers.keys());
  }
  
  static isSupported(platform: string): platform is PlatformType {
    return this.providers.has(platform as PlatformType);
  }
}

export function createPlatformProvider(platform: PlatformType): PlatformProvider {
  return PlatformFactory.create(platform);
}

export async function initializePlatforms() {
  const { createRedditProvider } = await import('./reddit/provider');
  const { createYouTubeProvider } = await import('./youtube/provider');
  
  PlatformFactory.register('reddit', createRedditProvider);
  PlatformFactory.register('youtube', createYouTubeProvider);
}