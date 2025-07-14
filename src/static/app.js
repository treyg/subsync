class MultiPlatformTransferApp {
  constructor() {
    this.subscriptions = [];
    this.selectedSubscriptions = new Set();
    this.transferId = null;
    this.transferInterval = null;
    this.savedPostsData = null;
    this.platforms = [];
    this.selectedPlatforms = { source: null, target: null };

    this.initializeElements();
    this.bindEvents();
    this.loadPlatforms();
    this.checkStatus();
  }

  initializeElements() {
    this.elements = {
      // Platform selection
      sourcePlatform: document.getElementById("source-platform"),
      targetPlatform: document.getElementById("target-platform"),
      
      // Account connection
      connectSource: document.getElementById("connect-source"),
      connectTarget: document.getElementById("connect-target"),
      sourceStatus: document.getElementById("source-status"),
      targetStatus: document.getElementById("target-status"),
      
      // Platform compatibility
      platformCompatibility: document.getElementById("platform-compatibility"),
      compatibilityMessage: document.getElementById("compatibility-message"),
      
      // Subscriptions
      subscriptionsSection: document.getElementById("subscriptions-section"),
      subscriptionsTitle: document.getElementById("subscriptions-title"),
      loadSubscriptions: document.getElementById("load-subscriptions"),
      subscriptionsLoading: document.getElementById("subscriptions-loading"),
      subscriptionsList: document.getElementById("subscriptions-list"),
      selectAll: document.getElementById("select-all"),
      selectNone: document.getElementById("select-none"),
      startTransfer: document.getElementById("start-transfer"),
      selectedCount: document.getElementById("selected-count"),
      clearAllTarget: document.getElementById("clear-all-target"),
      
      // Transfer progress
      transferSection: document.getElementById("transfer-section"),
      progressFill: document.getElementById("progress-fill"),
      progressCurrent: document.getElementById("progress-current"),
      progressTotal: document.getElementById("progress-total"),
      statSuccessful: document.getElementById("stat-successful"),
      statFailed: document.getElementById("stat-failed"),
      statSkipped: document.getElementById("stat-skipped"),
      transferLog: document.getElementById("transfer-log"),
      
      // Search and filter
      searchFilter: document.querySelector(".search-filter"),
      subscriptionSearch: document.getElementById("subscription-search"),
      
      // Content transfer
      transferSavedPosts: document.getElementById("transfer-saved-posts"),
      savedPostsCount: document.getElementById("saved-posts-count"),
      contentTransferTitle: document.getElementById("content-transfer-title"),
      contentTransferLabel: document.getElementById("content-transfer-label"),
      contentTransferNote: document.getElementById("content-transfer-note"),
      
      // Content transfer progress
      savedPostsProgress: document.getElementById("saved-posts-progress"),
      savedPostsProgressFill: document.getElementById("saved-posts-progress-fill"),
      savedPostsCurrent: document.getElementById("saved-posts-current"),
      savedPostsTotal: document.getElementById("saved-posts-total"),
      savedPostsSuccessful: document.getElementById("saved-posts-successful"),
      savedPostsFailed: document.getElementById("saved-posts-failed"),
    };
  }

  bindEvents() {
    // Platform selection
    this.elements.sourcePlatform.addEventListener("change", (e) =>
      this.onPlatformChange("source", e.target.value)
    );
    this.elements.targetPlatform.addEventListener("change", (e) =>
      this.onPlatformChange("target", e.target.value)
    );
    
    // Account connection
    this.elements.connectSource.addEventListener("click", () =>
      this.connectAccount("source")
    );
    this.elements.connectTarget.addEventListener("click", () =>
      this.connectAccount("target")
    );
    
    // Subscriptions
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

  async loadPlatforms() {
    try {
      const response = await fetch("/api/platforms");
      const data = await response.json();
      this.platforms = data.platforms;
      
      this.populatePlatformSelects();
    } catch (error) {
      console.error("Failed to load platforms:", error);
    }
  }

  populatePlatformSelects() {
    const selects = [this.elements.sourcePlatform, this.elements.targetPlatform];
    
    selects.forEach(select => {
      // Clear existing options except the first one
      while (select.children.length > 1) {
        select.removeChild(select.lastChild);
      }
      
      // Add platform options
      this.platforms.forEach(platform => {
        const option = document.createElement("option");
        option.value = platform.id;
        option.textContent = platform.name;
        if (!platform.enabled) {
          option.disabled = true;
          option.textContent += " (Not Configured)";
        }
        select.appendChild(option);
      });
    });
  }

  onPlatformChange(type, platformId) {
    this.selectedPlatforms[type] = platformId || null;
    
    // Force target platform to match source platform
    if (type === 'source' && platformId) {
      this.selectedPlatforms.target = platformId;
      this.elements.targetPlatform.value = platformId;
    } else if (type === 'target' && platformId) {
      this.selectedPlatforms.source = platformId;
      this.elements.sourcePlatform.value = platformId;
    }
    
    // Enable/disable connect button
    const connectButton = this.elements[`connect${type.charAt(0).toUpperCase() + type.slice(1)}`];
    connectButton.disabled = !platformId;
    
    this.updatePlatformCompatibility();
    this.updateUI();
  }

  updatePlatformCompatibility() {
    const { source, target } = this.selectedPlatforms;
    
    if (source && target) {
      this.elements.platformCompatibility.style.display = "block";
      
      let message = "";
      let className = "";
      
      if (source === target) {
        message = `✓ ${this.getPlatformName(source)} to ${this.getPlatformName(target)} transfer`;
        className = "compatible";
      } else {
        message = `⚠ Cross-platform transfer: ${this.getPlatformName(source)} to ${this.getPlatformName(target)}`;
        className = "cross-platform";
      }
      
      this.elements.compatibilityMessage.textContent = message;
      this.elements.compatibilityMessage.className = className;
    } else {
      this.elements.platformCompatibility.style.display = "none";
    }
  }

  getPlatformName(platformId) {
    const platform = this.platforms.find(p => p.id === platformId);
    return platform ? platform.name : platformId;
  }

  updateUI() {
    // Update labels based on selected platforms
    const sourcePlatform = this.selectedPlatforms.source;
    const targetPlatform = this.selectedPlatforms.target;
    
    if (sourcePlatform) {
      const platformName = this.getPlatformName(sourcePlatform);
      
      // Update subscriptions title
      if (sourcePlatform === 'reddit') {
        this.elements.subscriptionsTitle.textContent = "Subreddit Subscriptions";
        this.elements.subscriptionSearch.placeholder = "Search subreddits...";
      } else if (sourcePlatform === 'youtube') {
        this.elements.subscriptionsTitle.textContent = "YouTube Subscriptions";
        this.elements.subscriptionSearch.placeholder = "Search channels...";
      }
      
      // Update content transfer labels
      if (sourcePlatform === 'reddit') {
        this.elements.contentTransferTitle.textContent = "Saved Posts Transfer";
        this.elements.contentTransferLabel.textContent = "Also transfer saved posts from source account";
        this.elements.contentTransferNote.textContent = "Saved posts will be automatically fetched from your source account and transferred to your target account.";
      } else if (sourcePlatform === 'youtube') {
        this.elements.contentTransferTitle.textContent = "Playlist Transfer";
        this.elements.contentTransferLabel.textContent = "Also transfer playlists from source account";
        this.elements.contentTransferNote.textContent = "Playlists will be automatically fetched from your source account and transferred to your target account.";
      }
    }
  }

  async checkStatus() {
    try {
      const response = await fetch("/api/status");
      const status = await response.json();

      // Update platform selections if accounts are connected
      if (status.selectedPlatforms) {
        if (status.selectedPlatforms.source) {
          this.elements.sourcePlatform.value = status.selectedPlatforms.source;
          this.selectedPlatforms.source = status.selectedPlatforms.source;
        }
        if (status.selectedPlatforms.target) {
          this.elements.targetPlatform.value = status.selectedPlatforms.target;
          this.selectedPlatforms.target = status.selectedPlatforms.target;
        }
      }

      this.updateAccountStatus("source", status.sourceAccount);
      this.updateAccountStatus("target", status.targetAccount);
      this.updatePlatformCompatibility();
      this.updateUI();

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
      
      let displayName = account.displayName || account.username;
      let platformPrefix = "";
      
      if (account.platform === 'reddit') {
        platformPrefix = "u/";
      } else if (account.platform === 'youtube') {
        platformPrefix = "";
      }
      
      text.textContent = `Connected as ${platformPrefix}${displayName}`;
      connectButton.textContent = `Reconnect ${
        type.charAt(0).toUpperCase() + type.slice(1)
      } Account`;
      connectButton.disabled = false;
    } else {
      indicator.className = "status-indicator disconnected";
      text.textContent = "Not connected";
      connectButton.textContent = `Connect ${
        type.charAt(0).toUpperCase() + type.slice(1)
      } Account`;
      connectButton.disabled = !this.selectedPlatforms[type];
    }
  }

  connectAccount(type) {
    const platform = this.selectedPlatforms[type];
    if (!platform) {
      alert("Please select a platform first.");
      return;
    }
    
    window.location.href = `/auth/login?type=${type}&platform=${platform}`;
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
      item.dataset.subscriptionId = sub.id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `sub-${sub.id}`;
      checkbox.addEventListener("change", () => this.toggleSubscription(sub.id));

      const label = document.createElement("label");
      label.htmlFor = `sub-${sub.id}`;

      const info = document.createElement("div");
      info.className = "subscription-info";

      const name = document.createElement("div");
      name.className = "subscription-name";
      name.textContent = sub.displayName;

      const meta = document.createElement("div");
      meta.className = "subscription-meta";
      
      let metaText = "";
      if (sub.subscriberCount) {
        metaText += `${sub.subscriberCount.toLocaleString()} subscribers`;
      }
      if (sub.platform) {
        metaText += metaText ? ` • ${sub.platform}` : sub.platform;
      }
      meta.textContent = metaText;

      info.appendChild(name);
      if (metaText) {
        info.appendChild(meta);
      }

      if (sub.description) {
        const description = document.createElement("div");
        description.className = "subscription-description";
        description.textContent = sub.description.substring(0, 100) + (sub.description.length > 100 ? "..." : "");
        info.appendChild(description);
      }

      label.appendChild(info);
      item.appendChild(checkbox);
      item.appendChild(label);

      container.appendChild(item);
    });

    this.updateSelectionCount();
  }

  toggleSubscription(subscriptionId) {
    if (this.selectedSubscriptions.has(subscriptionId)) {
      this.selectedSubscriptions.delete(subscriptionId);
    } else {
      this.selectedSubscriptions.add(subscriptionId);
    }
    this.updateSelectionCount();
  }

  selectAll() {
    this.selectedSubscriptions.clear();
    this.subscriptions.forEach((sub) => {
      this.selectedSubscriptions.add(sub.id);
    });
    this.updateCheckboxes();
    this.updateSelectionCount();
  }

  selectNone() {
    this.selectedSubscriptions.clear();
    this.updateCheckboxes();
    this.updateSelectionCount();
  }

  updateCheckboxes() {
    const checkboxes = this.elements.subscriptionsList.querySelectorAll(
      'input[type="checkbox"]'
    );
    checkboxes.forEach((checkbox) => {
      const subscriptionId = checkbox.id.replace("sub-", "");
      checkbox.checked = this.selectedSubscriptions.has(subscriptionId);
    });
  }

  updateSelectionCount() {
    const count = this.selectedSubscriptions.size;
    this.elements.selectedCount.textContent = `${count} selected`;
    this.elements.startTransfer.disabled = count === 0;
  }

  filterSubscriptions(query) {
    const items = this.elements.subscriptionsList.querySelectorAll(
      ".subscription-item"
    );
    const lowerQuery = query.toLowerCase();

    items.forEach((item) => {
      const name = item.querySelector(".subscription-name").textContent.toLowerCase();
      const description = item.querySelector(".subscription-description")?.textContent?.toLowerCase() || "";
      
      if (name.includes(lowerQuery) || description.includes(lowerQuery)) {
        item.style.display = "block";
      } else {
        item.style.display = "none";
      }
    });
  }

  async startTransfer() {
    if (this.selectedSubscriptions.size === 0) {
      alert("Please select at least one subscription to transfer.");
      return;
    }

    const transferSavedPosts = this.elements.transferSavedPosts.checked;
    let savedPostsData = null;

    if (transferSavedPosts) {
      try {
        const response = await fetch("/api/saved-posts/export", {
          method: "POST",
        });

        if (response.ok) {
          savedPostsData = await response.json();
        } else {
          console.warn("Failed to export saved content, continuing without it");
        }
      } catch (error) {
        console.warn("Failed to export saved content:", error);
      }
    }

    try {
      const response = await fetch("/api/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscriptions: Array.from(this.selectedSubscriptions),
          transferSavedPosts,
          savedPostsData,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      this.transferId = result.transferId;

      this.elements.transferSection.style.display = "block";
      this.startTransferMonitoring();
    } catch (error) {
      console.error("Failed to start transfer:", error);
      alert("Failed to start transfer. Please try again.");
    }
  }

  async clearAllTarget() {
    if (!confirm("Are you sure you want to clear all subscriptions from the target account? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch("/api/clear-all", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      this.transferId = result.transferId;

      this.elements.transferSection.style.display = "block";
      this.startTransferMonitoring();
    } catch (error) {
      console.error("Failed to start clear all:", error);
      alert("Failed to start clear all operation. Please try again.");
    }
  }

  startTransferMonitoring() {
    this.transferInterval = setInterval(() => {
      this.checkTransferStatus();
    }, 1000);
  }

  async checkTransferStatus() {
    if (!this.transferId) return;

    try {
      const response = await fetch(`/api/transfer/${this.transferId}`);
      if (!response.ok) return;

      const status = await response.json();
      this.updateTransferProgress(status);

      if (status.status === "completed" || status.status === "failed") {
        clearInterval(this.transferInterval);
        this.transferInterval = null;
      }
    } catch (error) {
      console.error("Failed to check transfer status:", error);
    }
  }

  updateTransferProgress(status) {
    // Update main progress
    const progress = status.total > 0 ? (status.processed / status.total) * 100 : 0;
    this.elements.progressFill.style.width = `${progress}%`;
    this.elements.progressCurrent.textContent = status.processed;
    this.elements.progressTotal.textContent = status.total;

    // Update stats
    this.elements.statSuccessful.textContent = status.successful;
    this.elements.statFailed.textContent = status.failed;
    
    // Count already exists items
    const alreadyExists = status.results?.filter(r => r.alreadyExists).length || 0;
    this.elements.statSkipped.textContent = alreadyExists;

    // Update saved posts progress if enabled
    if (status.savedPostsTransfer) {
      this.elements.savedPostsProgress.style.display = "block";
      
      const savedProgress = status.savedPostsTransfer.total > 0 
        ? (status.savedPostsTransfer.processed / status.savedPostsTransfer.total) * 100 
        : 0;
      this.elements.savedPostsProgressFill.style.width = `${savedProgress}%`;
      this.elements.savedPostsCurrent.textContent = status.savedPostsTransfer.processed;
      this.elements.savedPostsTotal.textContent = status.savedPostsTransfer.total;
      this.elements.savedPostsSuccessful.textContent = status.savedPostsTransfer.successful;
      this.elements.savedPostsFailed.textContent = status.savedPostsTransfer.failed;
    }

    // Update log with recent results
    if (status.results && status.results.length > 0) {
      const recentResults = status.results.slice(-5); // Show last 5 results
      const logHTML = recentResults
        .map((result) => {
          const statusIcon = result.success ? "✓" : "✗";
          const statusClass = result.success ? "success" : "error";
          let message = `${statusIcon} ${result.targetName}`;
          
          if (result.alreadyExists) {
            message += " (already exists)";
          } else if (result.error) {
            message += ` - ${result.error}`;
          }
          
          return `<div class="log-entry ${statusClass}">${message}</div>`;
        })
        .join("");
      
      this.elements.transferLog.innerHTML = logHTML;
    }

    // Show completion message
    if (status.status === "completed") {
      const message = `Transfer completed! ${status.successful}/${status.total} items transferred successfully.`;
      this.elements.transferLog.innerHTML += `<div class="log-entry success"><strong>${message}</strong></div>`;
    } else if (status.status === "failed") {
      this.elements.transferLog.innerHTML += `<div class="log-entry error"><strong>Transfer failed. Please try again.</strong></div>`;
    }
  }
}

// Initialize the app when the page loads
document.addEventListener("DOMContentLoaded", () => {
  new MultiPlatformTransferApp();
});