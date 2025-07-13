class RedditTransferApp {
  constructor() {
    this.subscriptions = [];
    this.selectedSubscriptions = new Set();
    this.transferId = null;
    this.transferInterval = null;

    this.initializeElements();
    this.bindEvents();
    this.checkStatus();
  }

  initializeElements() {
    this.elements = {
      connectSource: document.getElementById("connect-source"),
      connectTarget: document.getElementById("connect-target"),
      sourceStatus: document.getElementById("source-status"),
      targetStatus: document.getElementById("target-status"),
      subscriptionsSection: document.getElementById("subscriptions-section"),
      loadSubscriptions: document.getElementById("load-subscriptions"),
      subscriptionsLoading: document.getElementById("subscriptions-loading"),
      subscriptionsList: document.getElementById("subscriptions-list"),
      selectAll: document.getElementById("select-all"),
      selectNone: document.getElementById("select-none"),
      startTransfer: document.getElementById("start-transfer"),
      selectedCount: document.getElementById("selected-count"),
      clearAllTarget: document.getElementById("clear-all-target"),
      transferSection: document.getElementById("transfer-section"),
      progressFill: document.getElementById("progress-fill"),
      progressCurrent: document.getElementById("progress-current"),
      progressTotal: document.getElementById("progress-total"),
      statSuccessful: document.getElementById("stat-successful"),
      statFailed: document.getElementById("stat-failed"),
      statSkipped: document.getElementById("stat-skipped"),
      transferLog: document.getElementById("transfer-log"),
      searchFilter: document.querySelector(".search-filter"),
      subscriptionSearch: document.getElementById("subscription-search"),
    };
  }

  bindEvents() {
    this.elements.connectSource.addEventListener("click", () =>
      this.connectAccount("source")
    );
    this.elements.connectTarget.addEventListener("click", () =>
      this.connectAccount("target")
    );
    this.elements.loadSubscriptions.addEventListener("click", () =>
      this.loadSubscriptions()
    );
    this.elements.selectAll.addEventListener("click", () => this.selectAll());
    this.elements.selectNone.addEventListener("click", () => this.selectNone());
    this.elements.startTransfer.addEventListener("click", () =>
      this.startTransfer()
    );
    this.elements.clearAllTarget.addEventListener("click", () =>
      this.clearAllTarget()
    );
    this.elements.subscriptionSearch.addEventListener("input", (e) =>
      this.filterSubscriptions(e.target.value)
    );
  }

  async checkStatus() {
    try {
      const response = await fetch("/api/status");
      const status = await response.json();

      this.updateAccountStatus("source", status.sourceAccount);
      this.updateAccountStatus("target", status.targetAccount);

      if (status.sourceAccount && status.targetAccount) {
        this.elements.subscriptionsSection.style.display = "block";
      }
      
      // Enable clear all button only if target account is connected
      this.elements.clearAllTarget.disabled = !status.targetAccount;
    } catch (error) {
      console.error("Failed to check status:", error);
    }
  }

  updateAccountStatus(type, account) {
    const statusElement = this.elements[`${type}Status`];
    const connectButton =
      this.elements[`connect${type.charAt(0).toUpperCase() + type.slice(1)}`];

    const indicator = statusElement.querySelector(".status-indicator");
    const text = statusElement.querySelector(".status-text");

    if (account) {
      indicator.className = "status-indicator connected";
      text.textContent = `Connected as u/${account.username}`;
      connectButton.textContent = `Reconnect ${
        type.charAt(0).toUpperCase() + type.slice(1)
      } Account`;
    } else {
      indicator.className = "status-indicator disconnected";
      text.textContent = "Not connected";
      connectButton.textContent = `Connect ${
        type.charAt(0).toUpperCase() + type.slice(1)
      } Account`;
    }
  }

  connectAccount(type) {
    window.location.href = `/auth/login?type=${type}`;
  }

  async loadSubscriptions() {
    this.elements.subscriptionsLoading.style.display = "flex";
    this.elements.loadSubscriptions.disabled = true;

    try {
      const response = await fetch("/api/subscriptions");

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      this.subscriptions = await response.json();
      this.renderSubscriptions();
      this.elements.searchFilter.style.display = "block";
    } catch (error) {
      console.error("Failed to load subscriptions:", error);
      alert(
        "Failed to load subscriptions. Please check your source account connection."
      );
    } finally {
      this.elements.subscriptionsLoading.style.display = "none";
      this.elements.loadSubscriptions.disabled = false;
    }
  }

  renderSubscriptions() {
    const container = this.elements.subscriptionsList;
    container.innerHTML = "";

    this.subscriptions.forEach((sub) => {
      const item = document.createElement("div");
      item.className = "subscription-item";

      item.innerHTML = `
                <input type="checkbox" class="subscription-checkbox" data-subreddit="${
                  sub.display_name
                }">
                <div class="subscription-info">
                    <div class="subscription-name">r/${sub.display_name}</div>
                    <div class="subscription-description">${
                      sub.public_description || "No description"
                    }</div>
                </div>
                <div class="subscription-stats">
                    ${
                      sub.subscribers
                        ? `${this.formatNumber(sub.subscribers)} subscribers`
                        : ""
                    }
                </div>
            `;

      const checkbox = item.querySelector(".subscription-checkbox");
      checkbox.addEventListener("change", (e) => {
        if (e.target.checked) {
          this.selectedSubscriptions.add(sub.display_name);
        } else {
          this.selectedSubscriptions.delete(sub.display_name);
        }
        this.updateSelectedCount();
      });

      container.appendChild(item);
    });

    this.updateSelectedCount();
  }

  selectAll() {
    const checkboxes = this.elements.subscriptionsList.querySelectorAll(
      ".subscription-checkbox"
    );
    checkboxes.forEach((checkbox) => {
      checkbox.checked = true;
      this.selectedSubscriptions.add(checkbox.dataset.subreddit);
    });
    this.updateSelectedCount();
  }

  selectNone() {
    const checkboxes = this.elements.subscriptionsList.querySelectorAll(
      ".subscription-checkbox"
    );
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    this.selectedSubscriptions.clear();
    this.updateSelectedCount();
  }

  updateSelectedCount() {
    const count = this.selectedSubscriptions.size;
    this.elements.selectedCount.textContent = `${count} selected`;
    this.elements.startTransfer.disabled = count === 0;
  }

  async clearAllTarget() {
    if (!confirm("⚠️ WARNING: This will unsubscribe the target account from ALL current subreddits.\n\nThis action cannot be undone. Are you sure you want to continue?")) {
      return;
    }

    try {
      const response = await fetch("/api/clear-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      this.transferId = result.transferId;

      this.elements.transferSection.style.display = "block";
      this.elements.clearAllTarget.disabled = true;

      this.initializeProgress("Fetching current subscriptions...");
      this.startProgressPolling();
    } catch (error) {
      console.error("Failed to start clear all:", error);
      alert(
        "Failed to start clear all. Please check your target account connection."
      );
    }
  }

  async startTransfer() {
    if (this.selectedSubscriptions.size === 0) return;

    const subreddits = Array.from(this.selectedSubscriptions);

    try {
      const response = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subreddits }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      this.transferId = result.transferId;

      this.elements.transferSection.style.display = "block";
      this.elements.startTransfer.disabled = true;

      this.initializeProgress(subreddits.length);
      this.startProgressPolling();
    } catch (error) {
      console.error("Failed to start transfer:", error);
      alert(
        "Failed to start transfer. Please check your target account connection."
      );
    }
  }

  initializeProgress(total) {
    if (typeof total === 'number') {
      this.elements.progressTotal.textContent = total;
      this.elements.progressCurrent.textContent = "0";
    } else {
      this.elements.progressTotal.textContent = "...";
      this.elements.progressCurrent.textContent = total;
    }
    this.elements.progressFill.style.width = "0%";
    this.elements.statSuccessful.textContent = "0";
    this.elements.statFailed.textContent = "0";
    this.elements.statSkipped.textContent = "0";
    this.elements.transferLog.innerHTML = "";

    const message = typeof total === 'number' ? "Transfer started..." : "Clear all started...";
    this.addLogEntry(message, "info");
  }

  startProgressPolling() {
    this.transferInterval = setInterval(() => {
      this.pollTransferStatus();
    }, 1000);
  }

  async pollTransferStatus() {
    if (!this.transferId) return;

    try {
      const response = await fetch(`/api/transfer/${this.transferId}`);
      const status = await response.json();

      if (status) {
        this.updateProgress(status);

        if (status.status === "completed" || status.status === "failed") {
          clearInterval(this.transferInterval);
          this.transferInterval = null;
          this.elements.startTransfer.disabled = false;
          this.elements.clearAllTarget.disabled = false;

          if (status.status === "completed") {
            this.addLogEntry("Operation completed!", "info");
          } else {
            this.addLogEntry("Operation failed!", "error");
          }
        }
      }
    } catch (error) {
      console.error("Failed to poll transfer status:", error);
    }
  }

  updateProgress(status) {
    const progress =
      status.total > 0 ? (status.processed / status.total) * 100 : 0;

    this.elements.progressFill.style.width = `${progress}%`;
    this.elements.progressCurrent.textContent = status.processed;
    this.elements.statSuccessful.textContent = status.successful;
    this.elements.statFailed.textContent = status.failed;

    // Count already subscribed as skipped
    const skipped = status.results.filter((r) => r.alreadySubscribed).length;
    this.elements.statSkipped.textContent = skipped;

    // Add new log entries
    const logEntries = this.elements.transferLog.children.length;
    for (let i = logEntries - 1; i < status.results.length; i++) {
      const result = status.results[i];
      if (result.success) {
        if (result.alreadySubscribed) {
          this.addLogEntry(
            `r/${result.subreddit} - Already subscribed`,
            "info"
          );
        } else {
          // Determine if this is a subscribe or unsubscribe operation based on the results
          const isUnsubscribe = status.results.some(r => r.error?.includes("unsubscribe") || r.error?.includes("Access denied - unable to unsubscribe"));
          const action = isUnsubscribe ? "Unsubscribed" : "Subscribed";
          this.addLogEntry(
            `r/${result.subreddit} - ${action} successfully`,
            "success"
          );
        }
      } else {
        this.addLogEntry(`r/${result.subreddit} - ${result.error}`, "error");
      }
    }
  }

  addLogEntry(message, type) {
    const entry = document.createElement("div");
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.elements.transferLog.appendChild(entry);
    this.elements.transferLog.scrollTop =
      this.elements.transferLog.scrollHeight;
  }

  filterSubscriptions(searchTerm) {
    const items = this.elements.subscriptionsList.querySelectorAll(".subscription-item");
    const normalizedSearch = searchTerm.toLowerCase().trim();
    
    items.forEach(item => {
      const checkbox = item.querySelector(".subscription-checkbox");
      const subredditName = checkbox.dataset.subreddit.toLowerCase();
      const description = item.querySelector(".subscription-description").textContent.toLowerCase();
      
      if (subredditName.includes(normalizedSearch) || description.includes(normalizedSearch)) {
        item.style.display = "flex";
      } else {
        item.style.display = "none";
      }
    });
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M";
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + "k";
    }
    return num.toString();
  }
}

// Initialize app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new RedditTransferApp();
});
