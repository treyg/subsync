interface TransferResult {
  subreddit: string;
  success: boolean;
  error?: string;
  alreadySubscribed?: boolean;
}

interface TransferStatus {
  id: string;
  status: "started" | "in_progress" | "completed" | "failed";
  total: number;
  processed: number;
  successful: number;
  failed: number;
  results: TransferResult[];
  startedAt: Date;
  completedAt?: Date;
  savedPostsTransfer?: {
    enabled: boolean;
    total: number;
    processed: number;
    successful: number;
    failed: number;
    results: Array<{
      postId: string;
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
  private readonly maxRequests = 90; // Conservative limit under 100 QPM
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
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    this.processing = false;
  }
}

export function createTransferAPI() {
  const transfers = new Map<string, TransferStatus>();
  const rateLimiter = new RateLimiter();

  async function unsubscribeFromSubreddit(
    accessToken: string,
    subredditName: string
  ): Promise<TransferResult> {
    try {
      const response = await fetch("https://oauth.reddit.com/api/subscribe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "reddit-transfer-app/1.0.0",
        },
        body: new URLSearchParams({
          action: "unsub",
          sr_name: subredditName,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 403) {
          return {
            subreddit: subredditName,
            success: false,
            error: "Access denied - unable to unsubscribe",
          };
        } else if (response.status === 404) {
          return {
            subreddit: subredditName,
            success: false,
            error: "Subreddit not found",
          };
        }
        
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return {
        subreddit: subredditName,
        success: true,
      };
    } catch (error) {
      return {
        subreddit: subredditName,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async function subscribeToSubreddit(
    accessToken: string,
    subredditName: string
  ): Promise<TransferResult> {
    try {
      const response = await fetch("https://oauth.reddit.com/api/subscribe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "reddit-transfer-app/1.0.0",
        },
        body: new URLSearchParams({
          action: "sub",
          sr_name: subredditName,
          skip_initial_defaults: "true",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        if (response.status === 403) {
          return {
            subreddit: subredditName,
            success: false,
            error: "Access denied - private subreddit or banned user",
          };
        } else if (response.status === 404) {
          return {
            subreddit: subredditName,
            success: false,
            error: "Subreddit not found or deleted",
          };
        } else if (
          response.status === 400 &&
          errorText.includes("already_subscribed")
        ) {
          return {
            subreddit: subredditName,
            success: true,
            alreadySubscribed: true,
          };
        }

        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return {
        subreddit: subredditName,
        success: true,
      };
    } catch (error) {
      return {
        subreddit: subredditName,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  function startTransfer(
    transferId: string,
    accessToken: string,
    subreddits: string[],
    options?: { transferSavedPosts?: boolean; savedPostsData?: any }
  ) {
    const transfer: TransferStatus = {
      id: transferId,
      status: "started",
      total: subreddits.length,
      processed: 0,
      successful: 0,
      failed: 0,
      results: [],
      startedAt: new Date(),
    };

    if (options?.transferSavedPosts && options?.savedPostsData) {
      transfer.savedPostsTransfer = {
        enabled: true,
        total: options.savedPostsData.posts?.length || 0,
        processed: 0,
        successful: 0,
        failed: 0,
        results: [],
      };
    }

    transfers.set(transferId, transfer);

    // Start the transfer process asynchronously
    processTransfer(transferId, accessToken, subreddits, options).catch((error) => {
      console.error(`Transfer ${transferId} failed:`, error);
      transfer.status = "failed";
      transfer.completedAt = new Date();
    });

    return transfer;
  }

  async function processTransfer(
    transferId: string,
    accessToken: string,
    subreddits: string[],
    options?: { transferSavedPosts?: boolean; savedPostsData?: any }
  ) {
    const transfer = transfers.get(transferId);
    if (!transfer) return;

    transfer.status = "in_progress";

    for (const subreddit of subreddits) {
      try {
        const result = await rateLimiter.add(() =>
          subscribeToSubreddit(accessToken, subreddit)
        );

        transfer.results.push(result);
        transfer.processed++;

        if (result.success) {
          transfer.successful++;
        } else {
          transfer.failed++;
        }

        console.log(
          `Transfer ${transferId}: ${transfer.processed}/${
            transfer.total
          } - ${subreddit} ${result.success ? "SUCCESS" : "FAILED"}`
        );
      } catch (error) {
        console.error(`Transfer ${transferId} error for ${subreddit}:`, error);
        transfer.results.push({
          subreddit,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        transfer.processed++;
        transfer.failed++;
      }
    }

    // Process saved posts if enabled
    if (options?.transferSavedPosts && options?.savedPostsData && transfer.savedPostsTransfer) {
      console.log(`Transfer ${transferId}: Starting saved posts transfer...`);
      
      const { createSavedPostsAPI } = await import('./savedPosts');
      const savedPostsAPI = createSavedPostsAPI();
      
      for (const post of options.savedPostsData.posts) {
        try {
          const result = await rateLimiter.add(() =>
            savedPostsAPI.savePost(accessToken, post.name)
          );

          transfer.savedPostsTransfer.results.push({
            postId: post.name,
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
            `Transfer ${transferId} saved posts: ${transfer.savedPostsTransfer.processed}/${
              transfer.savedPostsTransfer.total
            } - ${post.title} ${result.success ? "SAVED" : "FAILED"}`
          );
        } catch (error) {
          console.error(`Transfer ${transferId} saved posts error for ${post.title}:`, error);
          transfer.savedPostsTransfer.results.push({
            postId: post.name,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          transfer.savedPostsTransfer.processed++;
          transfer.savedPostsTransfer.failed++;
        }
      }
    }

    transfer.status = "completed";
    transfer.completedAt = new Date();

    console.log(
      `Transfer ${transferId} completed: ${transfer.successful}/${transfer.total} subreddits successful`
    );
    
    if (transfer.savedPostsTransfer) {
      console.log(
        `Transfer ${transferId} saved posts completed: ${transfer.savedPostsTransfer.successful}/${transfer.savedPostsTransfer.total} posts saved`
      );
    }
  }

  function getTransferStatus(transferId: string): TransferStatus | null {
    return transfers.get(transferId) || null;
  }

  function getAllTransfers(): TransferStatus[] {
    return Array.from(transfers.values());
  }

  async function clearAllSubscriptions(accessToken: string): Promise<string> {
    const subscriptionAPI = await import('./subscriptions').then(m => m.createSubscriptionAPI());
    
    try {
      const subscriptions = await subscriptionAPI.getSubscriptions(accessToken);
      const transferId = crypto.randomUUID();
      
      const transfer: TransferStatus = {
        id: transferId,
        status: "started",
        total: subscriptions.length,
        processed: 0,
        successful: 0,
        failed: 0,
        results: [],
        startedAt: new Date(),
      };

      transfers.set(transferId, transfer);
      
      // Start the clear process asynchronously
      processClearAll(transferId, accessToken, subscriptions.map(s => s.display_name)).catch((error) => {
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
    accessToken: string,
    subreddits: string[]
  ) {
    const transfer = transfers.get(transferId);
    if (!transfer) return;

    transfer.status = "in_progress";

    for (const subreddit of subreddits) {
      try {
        const result = await rateLimiter.add(() =>
          unsubscribeFromSubreddit(accessToken, subreddit)
        );

        transfer.results.push(result);
        transfer.processed++;

        if (result.success) {
          transfer.successful++;
        } else {
          transfer.failed++;
        }

        console.log(
          `Clear all ${transferId}: ${transfer.processed}/${
            transfer.total
          } - ${subreddit} ${result.success ? "UNSUBSCRIBED" : "FAILED"}`
        );
      } catch (error) {
        console.error(`Clear all ${transferId} error for ${subreddit}:`, error);
        transfer.results.push({
          subreddit,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
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
  }

  return {
    startTransfer,
    getTransferStatus,
    getAllTransfers,
    clearAllSubscriptions,
  };
}
