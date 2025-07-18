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

      // Batch selection
      batchSelectionControls: document.getElementById("batch-selection-controls"),
      batchSize: document.getElementById("batch-size"),
      batchButtons: document.getElementById("batch-buttons"),

      // Content transfer progress
      savedPostsProgress: document.getElementById("saved-posts-progress"),
      savedPostsProgressFill: document.getElementById(
        "saved-posts-progress-fill"
      ),
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

    // Batch selection
    this.elements.batchSize.addEventListener("change", () =>
      this.updateBatchButtons()
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
    const selects = [
      this.elements.sourcePlatform,
      this.elements.targetPlatform,
    ];

    selects.forEach((select) => {
      // Clear existing options except the first one
      while (select.children.length > 1) {
        select.removeChild(select.lastChild);
      }

      // Add platform options
      this.platforms.forEach((platform) => {
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
    if (type === "source" && platformId) {
      this.selectedPlatforms.target = platformId;
      this.elements.targetPlatform.value = platformId;
    } else if (type === "target" && platformId) {
      this.selectedPlatforms.source = platformId;
      this.elements.sourcePlatform.value = platformId;
    }

    // Enable/disable connect button
    const connectButton =
      this.elements[`connect${type.charAt(0).toUpperCase() + type.slice(1)}`];
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
        message = `✓ ${this.getPlatformName(source)} to ${this.getPlatformName(
          target
        )} transfer`;
        className = "compatible";
      } else {
        message = `⚠ Cross-platform transfer: ${this.getPlatformName(
          source
        )} to ${this.getPlatformName(target)}`;
        className = "cross-platform";
      }

      this.elements.compatibilityMessage.textContent = message;
      this.elements.compatibilityMessage.className = className;
    } else {
      this.elements.platformCompatibility.style.display = "none";
    }
  }

  getPlatformName(platformId) {
    const platform = this.platforms.find((p) => p.id === platformId);
    return platform ? platform.name : platformId;
  }

  updateUI() {
    // Update labels based on selected platforms
    const sourcePlatform = this.selectedPlatforms.source;
    const targetPlatform = this.selectedPlatforms.target;

    if (sourcePlatform) {
      const platformName = this.getPlatformName(sourcePlatform);

      // Update subscriptions title
      if (sourcePlatform === "reddit") {
        this.elements.subscriptionsTitle.textContent =
          "Subreddit Subscriptions";
        this.elements.subscriptionSearch.placeholder = "Search subreddits...";
      } else if (sourcePlatform === "youtube") {
        this.elements.subscriptionsTitle.textContent = "YouTube Subscriptions";
        this.elements.subscriptionSearch.placeholder = "Search channels...";
      }

      // Update content transfer labels
      if (sourcePlatform === "reddit") {
        this.elements.contentTransferTitle.textContent = "Saved Posts Transfer";
        this.elements.contentTransferLabel.textContent =
          "Also transfer saved posts from source account";
        this.elements.contentTransferNote.textContent =
          "Saved posts will be automatically fetched from your source account and transferred to your target account.";
        this.elements.transferSavedPosts.disabled = false;
      } else if (sourcePlatform === "youtube") {
        this.elements.contentTransferTitle.textContent = "Content Transfer";
        this.elements.contentTransferLabel.textContent =
          "Content transfer not supported for YouTube";
        this.elements.contentTransferNote.textContent =
          "Only subscription transfers are available for YouTube.";
        this.elements.transferSavedPosts.disabled = true;
        this.elements.transferSavedPosts.checked = false;
      }

      // Show/hide batch selection controls based on platform
      if (sourcePlatform === "youtube") {
        this.elements.batchSelectionControls.style.display = "block";
      } else {
        this.elements.batchSelectionControls.style.display = "none";
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

      if (account.platform === "reddit") {
        platformPrefix = "u/";
      } else if (account.platform === "youtube") {
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
        let errorData;
        const responseText = await response.text();

        try {
          errorData = JSON.parse(responseText);
        } catch {
          // Fallback to text if not JSON
          errorData = { error: "unknown", message: responseText };
        }

        // Check for quota exceeded error
        if (response.status === 403 && errorData.error === "quota_exceeded") {
          this.showQuotaExceededDialog();
          return;
        }

        // Check for authentication errors
        if (response.status === 401 || errorData.error === "auth_expired") {
          alert(
            "Your authentication has expired. Please reconnect your source account."
          );
          return;
        }

        throw new Error(
          `HTTP ${response.status}: ${errorData.message || responseText}`
        );
      }

      this.subscriptions = await response.json();
      this.renderSubscriptions();
      this.elements.searchFilter.style.display = "block";
      this.updateBatchButtons();
    } catch (error) {
      console.error("Failed to load subscriptions:", error);

      // Parse error message for quota issues (fallback for any missed cases)
      const errorMessage = error.message || "";
      if (
        errorMessage.includes("quota exceeded") ||
        errorMessage.includes("quotaExceeded") ||
        errorMessage.includes("quota_exceeded")
      ) {
        this.showQuotaExceededDialog();
      } else {
        alert(
          "Failed to load subscriptions. Please check your source account connection."
        );
      }
    } finally {
      this.elements.subscriptionsLoading.style.display = "none";
      this.elements.loadSubscriptions.disabled = false;
    }
  }

  showQuotaExceededDialog() {
    const platform = this.selectedPlatforms.source;
    const platformName = platform === "youtube" ? "YouTube" : platform;

    // Create a more informative dialog
    const dialog = document.createElement("div");
    dialog.className = "quota-dialog-overlay";
    dialog.innerHTML = `
      <div class="quota-dialog">
        <div class="quota-dialog-header">
          <h3>⚠️ ${platformName} API Quota Exceeded</h3>
        </div>
        <div class="quota-dialog-content">
          <p>Your ${platformName} API quota has been exceeded for today.</p>
          <p><strong>What this means:</strong></p>
          <ul>
            <li>You've reached the daily limit on your account for ${platformName} API requests</li>
            <li>The quota resets every 24 hours</li>
          </ul>
          <p><strong>What you can do:</strong></p>
          <ul>
            <li>Wait 24 hours and try again tomorrow</li>
            <li>Try with a smaller number of subscriptions</li>
            ${
              platform === "youtube"
                ? "<li>Consider requesting a quota increase in Google Cloud Console (rarely approved for personal use)</li>"
                : ""
            }
          </ul>
        </div>
        <div class="quota-dialog-actions">
          <button onclick="this.closest('.quota-dialog-overlay').remove()" class="btn btn-primary">
            Understand
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Remove dialog when clicking outside
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });
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
      checkbox.addEventListener("change", () =>
        this.toggleSubscription(sub.id)
      );

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
        description.textContent =
          sub.description.substring(0, 100) +
          (sub.description.length > 100 ? "..." : "");
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
    this.clearBatchButtonSelection();
  }

  selectNone() {
    this.selectedSubscriptions.clear();
    this.updateCheckboxes();
    this.updateSelectionCount();
    this.clearBatchButtonSelection();
  }

  clearBatchButtonSelection() {
    const buttons = this.elements.batchButtons.querySelectorAll('.batch-btn');
    buttons.forEach(button => {
      button.classList.remove('selected');
    });
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
    const items =
      this.elements.subscriptionsList.querySelectorAll(".subscription-item");
    const lowerQuery = query.toLowerCase();

    items.forEach((item) => {
      const name = item
        .querySelector(".subscription-name")
        .textContent.toLowerCase();
      const description =
        item
          .querySelector(".subscription-description")
          ?.textContent?.toLowerCase() || "";

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
    if (
      !confirm(
        "Are you sure you want to clear all subscriptions from the target account? This action cannot be undone."
      )
    ) {
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
    const progress =
      status.total > 0 ? (status.processed / status.total) * 100 : 0;
    this.elements.progressFill.style.width = `${progress}%`;
    this.elements.progressCurrent.textContent = status.processed;
    this.elements.progressTotal.textContent = status.total;

    // Analyze errors for quota issues
    const quotaErrors =
      status.results?.filter(
        (r) => r.error && r.error.includes("quota exceeded")
      ).length || 0;

    const regularFailed = (status.failed || 0) - quotaErrors;

    // Update stats
    this.elements.statSuccessful.textContent = status.successful;
    this.elements.statFailed.textContent = regularFailed;

    // Count already exists items
    const alreadyExists =
      status.results?.filter((r) => r.alreadyExists).length || 0;
    this.elements.statSkipped.textContent = alreadyExists;

    // Show quota warning if quota errors detected
    this.updateQuotaWarning(quotaErrors, status);

    // Update saved posts progress if enabled
    if (status.savedPostsTransfer) {
      this.elements.savedPostsProgress.style.display = "block";

      const savedProgress =
        status.savedPostsTransfer.total > 0
          ? (status.savedPostsTransfer.processed /
              status.savedPostsTransfer.total) *
            100
          : 0;
      this.elements.savedPostsProgressFill.style.width = `${savedProgress}%`;
      this.elements.savedPostsCurrent.textContent =
        status.savedPostsTransfer.processed;
      this.elements.savedPostsTotal.textContent =
        status.savedPostsTransfer.total;
      this.elements.savedPostsSuccessful.textContent =
        status.savedPostsTransfer.successful;
      this.elements.savedPostsFailed.textContent =
        status.savedPostsTransfer.failed;
    }

    // Update log with recent results
    if (status.results && status.results.length > 0) {
      const recentResults = status.results.slice(-5); // Show last 5 results
      const logHTML = recentResults
        .map((result) => {
          const isQuotaError =
            result.error && result.error.includes("quota exceeded");
          const statusIcon = result.success ? "✓" : isQuotaError ? "⚠" : "✗";
          let statusClass = result.success ? "success" : "error";
          if (isQuotaError) statusClass = "quota-exceeded";

          let message = `${statusIcon} ${result.targetName}`;

          if (result.alreadyExists) {
            message += " (already exists)";
          } else if (result.error) {
            if (isQuotaError) {
              message += " - Quota exceeded";
            } else {
              message += ` - ${result.error}`;
            }
          }

          return `<div class="log-entry ${statusClass}">${message}</div>`;
        })
        .join("");

      this.elements.transferLog.innerHTML = logHTML;
      // Auto-scroll to bottom
      this.elements.transferLog.scrollTop =
        this.elements.transferLog.scrollHeight;
    }

    // Show completion message
    if (status.status === "completed") {
      const quotaErrors =
        status.results?.filter(
          (r) => r.error && r.error.includes("quota exceeded")
        ).length || 0;

      let message = `Transfer completed! ${status.successful}/${status.total} items transferred successfully.`;
      if (quotaErrors > 0) {
        message += ` ${quotaErrors} items were skipped due to quota limits.`;
      }
      this.elements.transferLog.innerHTML += `<div class="log-entry success"><strong>${message}</strong></div>`;
      // Auto-scroll to bottom
      this.elements.transferLog.scrollTop =
        this.elements.transferLog.scrollHeight;
    } else if (status.status === "failed") {
      this.elements.transferLog.innerHTML += `<div class="log-entry error"><strong>Transfer failed. Please try again.</strong></div>`;
      // Auto-scroll to bottom
      this.elements.transferLog.scrollTop =
        this.elements.transferLog.scrollHeight;
    }
  }

  updateQuotaWarning(quotaErrors, status) {
    // Remove existing quota warnings
    const existingWarning = document.getElementById("quota-warning");
    if (existingWarning) {
      existingWarning.remove();
    }

    if (quotaErrors > 0) {
      const warningDiv = document.createElement("div");
      warningDiv.id = "quota-warning";
      warningDiv.className = "quota-warning";

      const platform = status.sourcePlatform || status.targetPlatform;
      let platformName = platform === "youtube" ? "YouTube" : platform;

      warningDiv.innerHTML = `
        <div class="warning-header">⚠️ ${platformName} API Quota Exceeded</div>
        <div class="warning-message">
          ${quotaErrors} subscription${
        quotaErrors > 1 ? "s" : ""
      } could not be transferred due to daily quota limits.
          <br><strong>Please wait 24 hours before trying again.</strong>
        </div>
        <div class="warning-stats">
          <span class="quota-failed">${quotaErrors} quota limited</span>
        </div>
      `;

      // Insert warning before transfer stats
      const transferSection = this.elements.transferSection;
      const progressContainer = transferSection.querySelector(
        ".progress-container"
      );
      transferSection.insertBefore(warningDiv, progressContainer);

      // Update stats to show quota errors separately
      this.updateStatsWithQuota(quotaErrors);
    }
  }

  updateStatsWithQuota(quotaErrors) {
    if (quotaErrors > 0) {
      // Add quota stat if it doesn't exist
      let quotaStat = document.getElementById("stat-quota");
      if (!quotaStat) {
        const statsContainer =
          this.elements.transferSection.querySelector(".transfer-stats");
        const quotaStatDiv = document.createElement("div");
        quotaStatDiv.className = "stat quota-stat";
        quotaStatDiv.innerHTML = `
          <span class="stat-number" id="stat-quota">${quotaErrors}</span>
          <span class="stat-label">Quota Limited</span>
        `;
        statsContainer.appendChild(quotaStatDiv);
      } else {
        quotaStat.textContent = quotaErrors;
      }
    }
  }

  updateBatchButtons() {
    if (!this.subscriptions || this.subscriptions.length === 0) {
      this.elements.batchButtons.innerHTML = "";
      return;
    }

    const batchSize = parseInt(this.elements.batchSize.value);
    const totalSubscriptions = this.subscriptions.length;
    const numBatches = Math.ceil(totalSubscriptions / batchSize);

    this.elements.batchButtons.innerHTML = "";

    for (let i = 0; i < numBatches; i++) {
      const startIndex = i * batchSize;
      const endIndex = Math.min(startIndex + batchSize, totalSubscriptions);
      const count = endIndex - startIndex;

      const button = document.createElement("button");
      button.className = "batch-btn";
      button.textContent = `${startIndex + 1}-${endIndex} (${count})`;
      button.dataset.batchIndex = i;
      button.addEventListener("click", () => this.selectBatch(i));
      
      this.elements.batchButtons.appendChild(button);
    }

    // Add info text
    const infoText = document.createElement("div");
    infoText.className = "batch-info";
    infoText.textContent = `Total: ${totalSubscriptions} subscriptions`;
    infoText.style.marginTop = "0.5rem";
    infoText.style.fontSize = "0.85rem";
    infoText.style.color = "#6c757d";
    this.elements.batchButtons.appendChild(infoText);
  }

  selectBatch(batchIndex) {
    const batchSize = parseInt(this.elements.batchSize.value);
    const startIndex = batchIndex * batchSize;
    const endIndex = Math.min(startIndex + batchSize, this.subscriptions.length);

    // Clear current selection
    this.selectedSubscriptions.clear();

    // Select batch
    for (let i = startIndex; i < endIndex; i++) {
      this.selectedSubscriptions.add(this.subscriptions[i].id);
    }

    this.updateCheckboxes();
    this.updateSelectionCount();
    this.updateBatchButtonStyles(batchIndex);
  }

  updateBatchButtonStyles(selectedBatchIndex) {
    const buttons = this.elements.batchButtons.querySelectorAll('.batch-btn');
    buttons.forEach((button, index) => {
      if (index === selectedBatchIndex) {
        button.classList.add('selected');
      } else {
        button.classList.remove('selected');
      }
    });
  }
}

// Initialize the app when the page loads
document.addEventListener("DOMContentLoaded", () => {
  new MultiPlatformTransferApp();
});
