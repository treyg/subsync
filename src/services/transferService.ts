import type { Account } from '../auth/session';
import { createMultiPlatformTransferAPI } from '../api/transfer';

export interface TransferService {
  startTransfer(
    sourceAccount: Account,
    targetAccount: Account,
    subscriptions: string[],
    options?: { transferSavedPosts?: boolean; savedPostsData?: any }
  ): string;
  getTransferStatus(transferId: string): any;
  clearAllSubscriptions(targetAccount: Account): Promise<string>;
}

export class MultiPlatformTransferService implements TransferService {
  private transferAPI = createMultiPlatformTransferAPI();

  startTransfer(
    sourceAccount: Account,
    targetAccount: Account,
    subscriptions: string[],
    options?: { transferSavedPosts?: boolean; savedPostsData?: any }
  ): string {
    const transferId = crypto.randomUUID();
    this.transferAPI.startTransfer(
      transferId,
      sourceAccount,
      targetAccount,
      subscriptions,
      options
    );
    return transferId;
  }

  getTransferStatus(transferId: string): any {
    return this.transferAPI.getTransferStatus(transferId);
  }

  async clearAllSubscriptions(targetAccount: Account): Promise<string> {
    return this.transferAPI.clearAllSubscriptions(targetAccount);
  }
}