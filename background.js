// background.js - Service Worker for Audio Export Extension

/**
 * Global variables to track export state:
 * - activeExports: Object mapping tab IDs to their export status and statistics.
 * - activeTabIds: Set of tab IDs currently engaged in export.
 * - stopFlags: Set of tab IDs where an export stop was requested.
 */
let activeExports = {};
let activeTabIds = new Set();
let stopFlags = new Set();

// --- NEW: Define the target subdirectory for downloads ---
const DOWNLOAD_SUBDIRECTORY = "PlaudExports";

/**
 * Listener for incoming messages from content scripts and the popup.
 * Handles different actions such as stopping exports, starting background exports,
 * updating progress, and providing export status.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message.action);

  try {
    // Handle stop export request from popup or content script
    if (message.action === "stopExport") {
      const tabId = message.tabId;
      if (activeTabIds.has(tabId)) {
        // Mark the export as stopped and remove from active tracking
        stopFlags.add(tabId);
        activeTabIds.delete(tabId);

        if (activeExports[tabId]) {
          activeExports[tabId].status = "stopped";
        }

        // Attempt to notify the content script to stop the export process
        try {
          chrome.tabs
            .sendMessage(tabId, { action: "stopExportProcess" })
            .catch((err) => console.warn("Error sending stop message:", err));
        } catch (e) {
          console.warn("Failed to send stop message:", e);
        }

        // Notify the user via Chrome notifications about the stopped export
        chrome.notifications.create({
          type: "basic",
          iconUrl: "assets/icons/icon128.png", // Use relative path from manifest
          title: "Export Stopped",
          message: "The export process has been stopped.",
          priority: 1,
        });
      }

      // Respond immediately indicating success
      sendResponse({ success: true });
      return false; // Indicates synchronous response
    }

    // Check if the export process for the sender's tab should be stopped
    if (message.action === "checkShouldStop") {
      const tabId = sender.tab?.id;
      const shouldStop = stopFlags.has(tabId);
      sendResponse({ shouldStop });
      return false; // Synchronous response
    }

    // Start a new background export process
    if (message.action === "startBackgroundExport") {
      const tabId = message.tabId;

      // Begin tracking the export for this tab
      activeTabIds.add(tabId);
      stopFlags.delete(tabId); // Clear any previous stop flags

      activeExports[tabId] = {
        status: "running",
        filesProcessed: 0,
        filesSkipped: 0,
        filesErrored: 0,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
      };

      // Notify the user that the export has started
      chrome.notifications.create({
        type: "basic",
        iconUrl: "assets/icons/icon128.png", // Use relative path from manifest
        title: "Audio Export Started",
        message:
          "Export process is running in the background. You can switch tabs safely.",
        priority: 2,
      });

      // Prevent the browser from discarding the tab during export
      keepTabAlive(tabId);

      // Request the content script to begin processing the export
      try {
        chrome.tabs
          .sendMessage(tabId, { action: "runExportAll", background: true })
          .catch((err) => console.warn("Error starting export:", err));
      } catch (e) {
        console.warn("Failed to start export:", e);
      }

      // Respond with success
      sendResponse({ success: true, message: "Background export started" });
      return false; // Synchronous response
    }

    // Update export progress from the content script
    if (message.action === "exportProgressUpdate") {
      const tabId = sender.tab?.id;

      if (tabId && activeExports[tabId]) {
        // Merge new progress data with existing export stats
        activeExports[tabId] = {
          ...activeExports[tabId],
          ...message.data,
          lastUpdateTime: Date.now(),
        };

        // Issue periodic notifications for every 10 files processed
        if (
          message.data.filesProcessed % 10 === 0 &&
          message.data.filesProcessed > 0
        ) {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "assets/icons/icon128.png", // Use relative path from manifest
            title: "Export Progress",
            message: `Processed ${message.data.filesProcessed} files so far.`,
            priority: 1,
          });
        }
      }

      sendResponse({ success: true });
      return false; // Synchronous response
    }

    // Handle export completion
    if (message.action === "exportComplete") {
      const tabId = sender.tab?.id;

      if (tabId && activeExports[tabId]) {
        const stats = message.data;
        // Update status before notification
        activeExports[tabId].status = "completed";
        activeExports[tabId].filesProcessed = stats.filesProcessed;
        activeExports[tabId].filesErrored = stats.filesErrored;
        // Add other stats if needed

        // Notify the user of export completion with statistics
        chrome.notifications.create({
          type: "basic",
          iconUrl: "assets/icons/icon128.png", // Use relative path from manifest
          title: "Audio Export Complete",
          message: `Processed ${stats.filesProcessed} files. ${stats.filesErrored} errors.`,
          priority: 2,
        });

        // Schedule removal of export data after 1 minute
        setTimeout(() => {
          delete activeExports[tabId];
          activeTabIds.delete(tabId);
          stopFlags.delete(tabId);
          console.log(`Cleaned up export data for tab ${tabId}`);
        }, 60000);
      }

      sendResponse({ success: true });
      return false; // Synchronous response
    }

    // Provide the current export status for a given tab
    if (message.action === "getExportStatus") {
      const tabId = message.tabId;
      sendResponse({
        success: true,
        isRunning: activeTabIds.has(tabId),
        exportData: activeExports[tabId] || null,
      });
      return false; // Synchronous response
    }

    // Default case: Unrecognized message action
    console.warn("Unrecognized message action received:", message.action);
    sendResponse({ success: false, error: "Unknown message action" });
    return false; // Synchronous response
  } catch (error) {
    console.error("Error handling message:", error);
    sendResponse({ success: false, error: error.message });
    return false; // Synchronous response
  }
});

/**
 * keepTabAlive - Recursively ensures that a tab remains active during background exports.
 * Prevents the browser from suspending the tab when it's not visible and checks for stalled exports.
 *
 * @param {number} tabId - The ID of the tab to keep alive.
 */
async function keepTabAlive(tabId) {
  try {
    // Check if the export for this tab is still marked as active
    if (!activeTabIds.has(tabId)) {
      console.log(
        `keepTabAlive: Export for tab ${tabId} is no longer active. Stopping.`
      );
      return;
    }

    // Verify the tab still exists
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      console.log(`keepTabAlive: Tab ${tabId} not found. Cleaning up.`);
      activeTabIds.delete(tabId);
      stopFlags.delete(tabId);
      delete activeExports[tabId]; // Clean up associated export data
      return;
    }

    // Prevent the tab from being auto-discarded (if supported)
    if (chrome.tabs.update && typeof tab.autoDiscardable === "boolean") {
      await chrome.tabs
        .update(tabId, { autoDiscardable: false })
        .catch((err) =>
          console.warn(
            `keepTabAlive: Failed to set autoDiscardable for tab ${tabId}:`,
            err
          )
        );
    }

    // Check if export progress has stalled (no update for 2 minutes)
    const exportData = activeExports[tabId];
    if (exportData && exportData.status === "running") {
      const timeSinceLastUpdate = Date.now() - exportData.lastUpdateTime;
      if (timeSinceLastUpdate > 120000) {
        // 2 minutes
        console.warn(
          `keepTabAlive: Export for tab ${tabId} might be stalled. Last update ${Math.round(
            timeSinceLastUpdate / 1000
          )}s ago.`
        );
        chrome.notifications.create({
          type: "basic",
          iconUrl: "assets/icons/icon128.png", // Use relative path from manifest
          title: "Export May Be Stalled",
          message: `No updates received for export in tab ${tabId} for 2 minutes. Check the export tab.`,
          priority: 2,
        });
        // Consider adding logic here to auto-stop stalled exports if desired
      }
    }

    // Schedule the next keep-alive check in 30 seconds
    console.log(`keepTabAlive: Scheduling next check for tab ${tabId} in 30s.`);
    setTimeout(() => keepTabAlive(tabId), 30000);
  } catch (error) {
    console.error(`keepTabAlive: Error for tab ${tabId}:`, error);
    // Clean up on error to prevent infinite loops or resource leaks
    activeTabIds.delete(tabId);
    stopFlags.delete(tabId);
    delete activeExports[tabId];
  }
}

/**
 * cleanupStaleExports - Resets all tracking variables to clear out any old export data.
 * This is called on service worker startup and on extension installation or update.
 */
function cleanupStaleExports() {
  console.log("Cleaning up stale export data...");
  activeExports = {};
  activeTabIds.clear();
  stopFlags.clear();
}

// Initialize by cleaning up any stale exports on startup
cleanupStaleExports();

// Set up a handler to clean up exports when the extension is installed or updated
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed or updated:", details.reason);
  cleanupStaleExports();
});

// Monitor tab closure to clean up exports for tabs that are removed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (activeTabIds.has(tabId)) {
    console.log(`Tab ${tabId} with active export was closed. Cleaning up.`);
    activeTabIds.delete(tabId);
    stopFlags.delete(tabId);
    delete activeExports[tabId];
    // Optionally notify the user that closing the tab stopped the export
    chrome.notifications.create({
      type: "basic",
      iconUrl: "assets/icons/icon128.png",
      title: "Export Stopped",
      message: `Export process stopped because the tab was closed.`,
      priority: 1,
    });
  }
});

// --- NEW: Listener for determining download filename ---
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  console.log(
    "onDeterminingFilename event triggered for:",
    downloadItem.filename
  );

  // Check if the download originates from a tab where we are actively exporting
  const originatingTabId = downloadItem.tabId;
  if (originatingTabId && activeTabIds.has(originatingTabId)) {
    console.log(
      `Download from active export tab ${originatingTabId}. Filename: ${downloadItem.filename}`
    );

    // Basic check if it's likely the audio file we expect (e.g., MP3)
    // You might need more specific checks based on Plaud's naming patterns if possible
    if (
      downloadItem.filename &&
      downloadItem.filename.toLowerCase().endsWith(".mp3")
    ) {
      // Construct the new path including the subdirectory
      // Ensure DOWNLOAD_SUBDIRECTORY does not contain invalid path characters
      const safeSubdirectory = DOWNLOAD_SUBDIRECTORY.replace(
        /[\\/:*?"<>|]/g,
        "_"
      ); // Basic sanitization
      const newFilename = `${safeSubdirectory}/${downloadItem.filename}`;
      console.log(`Suggesting new filename: ${newFilename}`);

      suggest({
        filename: newFilename,
        conflictAction: "uniquify", // Options: 'uniquify', 'overwrite', 'prompt'
      });

      // Note: The 'suggest' function must be called synchronously within this event listener
      // if you are not returning true to indicate an asynchronous response.
      return; // Suggestion made, exit listener for this item
    } else {
      console.log(
        `Download from active tab ${originatingTabId}, but filename "${downloadItem.filename}" does not match expected pattern (.mp3). Allowing default.`
      );
    }
  } else {
    console.log(
      `Download filename "${
        downloadItem.filename
      }" did not originate from a tracked active export tab (${
        originatingTabId ? originatingTabId : "N/A"
      }). Allowing default.`
    );
  }

  // If the download doesn't meet the criteria, let the browser handle it normally.
  // No need to call suggest() here; simply returning lets the default behavior proceed.
});

console.log("Background script loaded and listeners initialized."); // Log script load
