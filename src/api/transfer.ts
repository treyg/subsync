import type { Account } from '../auth/session';
import type { PlatformType, TransferResult } from '../platforms/types';
import { createPlatformProvider } from '../platforms/factory';

interface MultiPlatformTransferResult {
  targetId: string;
  targetName: string;
  success: boolean;
  error?: string;
  alreadyExists?: boolean;
  platform: PlatformType;
}

interface MultiPlatformTransferStatus {
  id: string;
  status: "started" | "in_progress" | "completed" | "failed";
  total: number;
  processed: number;
  successful: number;
  failed: number;
  results: MultiPlatformTransferResult[];
  startedAt: Date;
  completedAt?: Date;
  sourcePlatform: PlatformType;
  targetPlatform: PlatformType;
  sourceAccount: string;
  targetAccount: string;
  savedPostsTransfer?: {
    enabled: boolean;
    total: number;
    processed: number;
    successful: number;
    failed: number;
    results: Array<{
      contentId: string;
      success: boolean;
      error?: string;
    }>;
  };
}

class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly maxRequests = 80; // Conservative limit
  private readonly windowMs = 60 * 1000; // 1 minute

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async processQueue() {
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();

      // Reset window if needed
      if (now - this.windowStart >= this.windowMs) {
        this.requestCount = 0;
        this.windowStart = now;
      }

      // Wait if we've hit the rate limit
      if (this.requestCount >= this.maxRequests) {
        const waitTime = this.windowMs - (now - this.windowStart);
        if (waitTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          this.requestCount = 0;
          this.windowStart = Date.now();
        }
      }

      const task = this.queue.shift();
      if (task) {
        this.requestCount++;
        await task();

        // Small delay between requests
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    this.processing = false;
  }
}

export function createMultiPlatformTransferAPI() {
  const transfers = new Map<string, MultiPlatformTransferStatus>();
  const rateLimiter = new RateLimiter();

  function startTransfer(
    transferId: string,
    sourceAccount: Account,
    targetAccount: Account,
    subscriptions: string[],
    options?: { transferSavedPosts?: boolean; savedPostsData?: any }
  ) {
    const transfer: MultiPlatformTransferStatus = {
      id: transferId,
      status: "started",
      total: subscriptions.length,
      processed: 0,
      successful: 0,
      failed: 0,
      results: [],
      startedAt: new Date(),
      sourcePlatform: sourceAccount.platform,
      targetPlatform: targetAccount.platform,
      sourceAccount: sourceAccount.displayName,
      targetAccount: targetAccount.displayName,
    };

    if (options?.transferSavedPosts && options?.savedPostsData) {
      transfer.savedPostsTransfer = {
        enabled: true,
        total: options.savedPostsData.content?.length || 0,
        processed: 0,
        successful: 0,
        failed: 0,
        results: [],
      };
    }

    transfers.set(transferId, transfer);

    // Start the transfer process asynchronously
    processTransfer(transferId, sourceAccount, targetAccount, subscriptions, options).catch((error) => {
      console.error(`Transfer ${transferId} failed:`, error);
      transfer.status = "failed";
      transfer.completedAt = new Date();
    });

    return transfer;
  }

  async function processTransfer(
    transferId: string,
    sourceAccount: Account,
    targetAccount: Account,
    subscriptions: string[],
    options?: { transferSavedPosts?: boolean; savedPostsData?: any }
  ) {
    const transfer = transfers.get(transferId);
    if (!transfer) return;

    transfer.status = "in_progress";

    try {
      const targetProvider = createPlatformProvider(targetAccount.platform);

      for (const subscriptionId of subscriptions) {
        try {
          const result = await rateLimiter.add(() =>
            targetProvider.subscribe(targetAccount.accessToken, subscriptionId)
          );

          const multiPlatformResult: MultiPlatformTransferResult = {
            targetId: result.targetId,
            targetName: result.targetName,
            success: result.success,
            error: result.error,
            alreadyExists: result.alreadyExists,
            platform: targetAccount.platform,
          };

          transfer.results.push(multiPlatformResult);
          transfer.processed++;

          if (result.success) {
            transfer.successful++;
          } else {
            transfer.failed++;
          }

          console.log(
            `Transfer ${transferId}: ${transfer.processed}/${transfer.total} - ${result.targetName} ${result.success ? "SUCCESS" : "FAILED"}`
          );
        } catch (error) {
          console.error(`Transfer ${transferId} error for ${subscriptionId}:`, error);
          transfer.results.push({
            targetId: subscriptionId,
            targetName: subscriptionId,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            platform: targetAccount.platform,
          });
          transfer.processed++;
          transfer.failed++;
        }
      }

      // Process saved content if enabled
      if (options?.transferSavedPosts && options?.savedPostsData && transfer.savedPostsTransfer) {
        console.log(`Transfer ${transferId}: Starting saved content transfer...`);
        
        const sourceProvider = createPlatformProvider(sourceAccount.platform);
        const targetProvider = createPlatformProvider(targetAccount.platform);

        if (sourceProvider.getContent && targetProvider.saveContent) {
          for (const content of options.savedPostsData.content) {
            try {
              const result = await rateLimiter.add(() =>
                targetProvider.saveContent!(targetAccount.accessToken, content.id)
              );

              transfer.savedPostsTransfer.results.push({
                contentId: content.id,
                success: result.success,
                error: result.error,
              });
              
              transfer.savedPostsTransfer.processed++;

              if (result.success) {
                transfer.savedPostsTransfer.successful++;
              } else {
                transfer.savedPostsTransfer.failed++;
              }

              console.log(
                `Transfer ${transferId} saved content: ${transfer.savedPostsTransfer.processed}/${
                  transfer.savedPostsTransfer.total
                } - ${content.title} ${result.success ? "SAVED" : "FAILED"}`
              );
            } catch (error) {
              console.error(`Transfer ${transferId} saved content error for ${content.title}:`, error);
              transfer.savedPostsTransfer.results.push({
                contentId: content.id,
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
              });
              transfer.savedPostsTransfer.processed++;
              transfer.savedPostsTransfer.failed++;
            }
          }
        } else {
          console.warn(`Transfer ${transferId}: Content transfer not supported between ${sourceAccount.platform} and ${targetAccount.platform}`);
        }
      }

      transfer.status = "completed";
      transfer.completedAt = new Date();

      console.log(
        `Transfer ${transferId} completed: ${transfer.successful}/${transfer.total} subscriptions successful`
      );
      
      if (transfer.savedPostsTransfer) {
        console.log(
          `Transfer ${transferId} saved content completed: ${transfer.savedPostsTransfer.successful}/${transfer.savedPostsTransfer.total} content saved`
        );
      }
    } catch (error) {
      console.error(`Transfer ${transferId} failed:`, error);
      transfer.status = "failed";
      transfer.completedAt = new Date();
    }
  }

  function getTransferStatus(transferId: string): MultiPlatformTransferStatus | null {
    return transfers.get(transferId) || null;
  }

  function getAllTransfers(): MultiPlatformTransferStatus[] {
    return Array.from(transfers.values());
  }

  async function clearAllSubscriptions(targetAccount: Account): Promise<string> {
    try {
      const targetProvider = createPlatformProvider(targetAccount.platform);
      const subscriptions = await targetProvider.getSubscriptions(targetAccount.accessToken);
      const transferId = crypto.randomUUID();
      
      const transfer: MultiPlatformTransferStatus = {
        id: transferId,
        status: "started",
        total: subscriptions.length,
        processed: 0,
        successful: 0,
        failed: 0,
        results: [],
        startedAt: new Date(),
        sourcePlatform: targetAccount.platform,
        targetPlatform: targetAccount.platform,
        sourceAccount: targetAccount.displayName,
        targetAccount: targetAccount.displayName,
      };

      transfers.set(transferId, transfer);
      
      // Start the clear process asynchronously
      processClearAll(transferId, targetAccount, subscriptions.map(s => s.id)).catch((error) => {
        console.error(`Clear all ${transferId} failed:`, error);
        transfer.status = "failed";
        transfer.completedAt = new Date();
      });
      
      return transferId;
    } catch (error) {
      throw new Error(`Failed to start clear all: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function processClearAll(
    transferId: string,
    targetAccount: Account,
    subscriptionIds: string[]
  ) {
    const transfer = transfers.get(transferId);
    if (!transfer) return;

    transfer.status = "in_progress";

    try {
      const targetProvider = createPlatformProvider(targetAccount.platform);

      for (const subscriptionId of subscriptionIds) {
        try {
          const result = await rateLimiter.add(() =>
            targetProvider.unsubscribe(targetAccount.accessToken, subscriptionId)
          );

          const multiPlatformResult: MultiPlatformTransferResult = {
            targetId: result.targetId,
            targetName: result.targetName,
            success: result.success,
            error: result.error,
            platform: targetAccount.platform,
          };

          transfer.results.push(multiPlatformResult);
          transfer.processed++;

          if (result.success) {
            transfer.successful++;
          } else {
            transfer.failed++;
          }

          console.log(
            `Clear all ${transferId}: ${transfer.processed}/${transfer.total} - ${result.targetName} ${result.success ? "UNSUBSCRIBED" : "FAILED"}`
          );
        } catch (error) {
          console.error(`Clear all ${transferId} error for ${subscriptionId}:`, error);
          transfer.results.push({
            targetId: subscriptionId,
            targetName: subscriptionId,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            platform: targetAccount.platform,
          });
          transfer.processed++;
          transfer.failed++;
        }
      }

      transfer.status = "completed";
      transfer.completedAt = new Date();

      console.log(
        `Clear all ${transferId} completed: ${transfer.successful}/${transfer.total} unsubscribed`
      );
    } catch (error) {
      console.error(`Clear all ${transferId} failed:`, error);
      transfer.status = "failed";
      transfer.completedAt = new Date();
    }
  }

  return {
    startTransfer,
    getTransferStatus,
    getAllTransfers,
    clearAllSubscriptions,
  };
}