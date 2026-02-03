/**
 * features/audioExport/audioExport.js
 */

// Module-scoped variables (previously on window)
let _downloadErrorOccurred = false;
let _downloadErrorListener = null;
let _originalConsoleError = null;

import {
  clickElement,
  rightClickWithRetry,
  delay, // Keep delay for short pauses/polling intervals if needed
  findElementByXPath,
  waitForElement, // Import new wait utility
  waitForCondition, // Import new wait utility
} from "../../common/domUtils.js";
import {
  createStatusIndicator,
  updateIndicator,
} from "../../common/uiComponents.js";
import {
  waitForDeleteMenuItem, // This already uses polling
  findElementByText,
  resetDomState,
} from "./deleteHelpers.js";

/**
 * Repeatedly scans .fileInfo items, exports and deletes each unprocessed file,
 * and updates progress. Supports both foreground and background processing.
 *
 * @param {boolean} backgroundMode - Whether the export runs in background mode.
 * @returns {Object} stats - Export statistics including processed, errored, and skipped file counts.
 */
export async function runExportAll(backgroundMode = false) {
  const indicator = createStatusIndicator();
  console.log(
    `Starting Export & Delete flow (Background mode: ${backgroundMode})...`
  );
  const stats = {
    filesProcessed: 0,
    filesErrored: 0,
    filesSkipped: 0,
    startTime: Date.now(),
  };
  const processedTitles = new Set();

  // --- updateProgress and shouldStopExport functions remain the same ---
  /**
   * Updates progress statistics and sends periodic progress notifications in background mode.
   * @param {string} current - The title of the current file.
   * @param {boolean} [error=false] - Flag indicating if an error occurred.
   */
  const updateProgress = (current, error = false) => {
    if (error) {
      stats.filesErrored++;
    } else {
      stats.filesProcessed++;
    }
    if (backgroundMode) {
      try {
        chrome.runtime
          .sendMessage({
            action: "exportProgressUpdate",
            data: { ...stats, currentTitle: current },
          })
          .catch((e) => console.warn("Failed to send progress update:", e));
      } catch (e) {
        console.warn("Error sending progress update:", e);
      }
    }
  };
  /**
   * Checks if the export process should stop.
   * @returns {Promise<boolean>} - Whether the export should stop.
   */
  async function shouldStopExport() {
    if (!backgroundMode) return false;
    try {
      const response = await fetch(
        chrome.runtime.getURL("stop-flag.txt")
      ).catch(() => ({ ok: false }));
      if (response.ok) return true;
      return chrome.runtime
        .sendMessage({ action: "checkShouldStop" })
        .then((response) => response?.shouldStop)
        .catch(() => false);
    } catch (e) {
      console.warn("Error checking stop status:", e);
      return false;
    }
  }
  // --- End of unchanged functions ---

  let fileCount = 0;
  let errorCount = 0;
  const maxErrors = 3;

  // Define selectors (adjust these based on Plaud.ai's actual UI)
  // It's better to use more stable selectors if available (e.g., data-testid, aria-label)
  const fileInfoSelector = ".fileInfo"; // Selector for individual file items
  const fileTitleSelector = ".title"; // Selector for the title within a file item
  // --- Selectors for export steps (These are EXAMPLE selectors and likely need adjustment) ---
  // Use more robust selectors if possible (IDs, data attributes, ARIA labels)
  const shareIconXPath =
    '//*[@id="rightBox"]/div[2]/div[1]/span[1]/span[1]/div[1]/div[1]'; // Very fragile XPath
  const shareIconSelector =
    '[aria-label="Share"], [data-testid="share-button"]'; // Example of more robust selectors
  const exportAudioOptionText = "Export Audio";
  const exportAudioOptionSelector = `li:contains("${exportAudioOptionText}"), [role="menuitem"]:contains("${exportAudioOptionText}")`;
  const mp3OptionText = "MP3";
  const mp3OptionSelector = `div:contains("${mp3OptionText}")`; // Example selector
  const exportButtonText = "Export";
  const exportButtonSelector = `div:contains("${exportButtonText}")[role="button"], button:contains("${exportButtonText}")`;

  try {
    setupDownloadErrorListener();

    while (true) {
      if (await shouldStopExport()) {
        updateIndicator(
          indicator,
          `Export stopped by user after ${fileCount} file(s).`,
          "info"
        );
        console.log("Export stopped by user request");
        return stats;
      }
      if (errorCount >= maxErrors) {
        updateIndicator(
          indicator,
          `Stopping after ${maxErrors} consecutive errors.`,
          "error"
        );
        throw new Error(`Stopping after ${maxErrors} consecutive errors.`);
      }

      // Find unprocessed files dynamically each iteration
      let unprocessedFiles = [];
      try {
        await waitForCondition(
          () => {
            const allFiles = Array.from(
              document.querySelectorAll(fileInfoSelector)
            );
            unprocessedFiles = allFiles.filter((el) => {
              const titleEl = el.querySelector(fileTitleSelector);
              const titleText = titleEl ? titleEl.textContent.trim() : "";
              // Ensure file has a title and hasn't been processed
              return titleText && !processedTitles.has(titleText);
            });
            // Wait until we find at least one file OR no files are left on the page at all
            return unprocessedFiles.length > 0 || allFiles.length === 0;
          },
          10000, // Wait up to 10 seconds for files to appear/load
          "finding unprocessed files"
        );
      } catch (e) {
        console.log(
          "No unprocessed files found or timed out waiting for them. Assuming completion."
        );
        unprocessedFiles = []; // Assume none found if timeout
      }

      console.log(`${unprocessedFiles.length} files remaining to process`);

      if (unprocessedFiles.length === 0) {
        updateIndicator(
          indicator,
          `All done! Processed ${fileCount} file(s).`,
          "success"
        );
        console.log("No more unprocessed items found. Done!");
        stats.endTime = Date.now();
        stats.duration = stats.endTime - stats.startTime;
        setTimeout(() => indicator.remove(), 6000); // Keep timeout for indicator removal
        return stats;
      }

      const fileElement = unprocessedFiles[0];
      const titleEl = fileElement.querySelector(fileTitleSelector);
      const fileTitle = titleEl ? titleEl.textContent.trim() : `(Untitled)`;

      fileCount++;
      updateIndicator(
        indicator,
        `Exporting file #${fileCount}: ${fileTitle}...`
      );
      console.log(`Starting to process "${fileTitle}"...`);

      try {
        // --- Background mode activity remains the same ---
        if (backgroundMode && document.visibilityState === "hidden") {
          console.log("Page is hidden but continuing export in background");
          if (typeof document.hidden !== "undefined") {
            setInterval(() => {
              fileElement.scrollIntoView({ behavior: "auto" });
            }, 1000); // This timer is for activity, not workflow timing
          }
        }
        // --- End background mode activity ---

        // === EXPORT STEPS (with dynamic waits) ===

        // 1. Click on the file element. Wait for something specific that indicates the file is selected/loaded in the right panel.
        //    Example: Wait for the share icon to appear or the title in the right panel. Adjust selector as needed.
        await clickElement(fileElement);
        // Instead of delay(2000), wait for the share icon using a more robust selector if possible
        // const shareIcon = await waitForElement(shareIconSelector, 10000);
        // Or fallback to XPath if necessary, but prefer CSS selectors
        const shareIcon = await findElementByXPath(shareIconXPath, 10000); // Using existing XPath with wait
        if (!shareIcon) {
          console.warn("Could not find share icon after click for:", fileTitle);
          throw new Error("Export step failed: unable to locate share control");
        }

        // 2. Click the share icon. Wait for the export menu/popover to appear.
        await clickElement(shareIcon);
        // Wait for the popover containing "Export Audio". Adjust selector if needed.
        // Example: wait for any popover, then find the text.
        const popoverSelector = '[id^="el-popover-"]'; // Selector for the popover container
        const popoverElement = await waitForElement(popoverSelector, 10000);
        // Now find the "Export Audio" option within the appeared popover
        let exportAudioOption = await findElementByText(
          exportAudioOptionText,
          "li",
          popoverElement
        ); // Search within the specific popover
        if (!exportAudioOption) {
          // Fallback if text search fails within popover
          exportAudioOption = popoverElement.querySelector(
            exportAudioOptionSelector
          );
        }
        if (!exportAudioOption) {
          console.warn(`Could not find '${exportAudioOptionText}' option in popover for:`, fileTitle);
          throw new Error("Export step failed: audio export option not available");
        }

        // 3. Click the "Export Audio" option. Wait for the format selection UI (e.g., MP3 option) to appear.
        await clickElement(exportAudioOption);
        // Wait for the MP3 option to be visible/clickable
        // const mp3Option = await waitForElement(mp3OptionSelector, 10000); // Using CSS selector example
        // Or fallback to XPath/Text
        let mp3Option = await findElementByXPath(
          '//*[@id="rightBox"]/div[2]/div[1]/div[2]/div[1]/div[2]/div[1]/ul[1]/li[1]/div[2]',
          10000
        ); // Fragile XPath with wait
        if (!mp3Option) {
          mp3Option = await findElementByText(mp3OptionText, "div");
        }
        if (!mp3Option) {
          console.warn("Could not find MP3 option for:", fileTitle);
          throw new Error("Export step failed: format selection unavailable");
        }

        // 4. Click the MP3 format option. Wait for the final export button to appear/become enabled.
        await clickElement(mp3Option);
        // Wait for the final Export button
        // const exportButton = await waitForElement(exportButtonSelector, 10000); // Using CSS selector example
        // Or fallback
        let exportButton = await findElementByXPath(
          '//*[@id="rightBox"]/div[2]/div[1]/div[2]/div[1]/div[2]/div[1]/div[3]',
          10000
        ); // Fragile XPath with wait
        if (!exportButton) {
          exportButton = await findElementByText(exportButtonText, "div");
        }
        if (!exportButton) {
          console.warn("Could not find final export button for:", fileTitle);
          throw new Error("Export step failed: export action unavailable");
        }

        // 5. Locate and click the final export button. Start download monitoring.
        _downloadErrorOccurred = false;
        await clickElement(exportButton);

        // Wait for download result (this already has a timeout)
        // The fixed 5-sec delay is removed, relying solely on waitForDownloadResult
        await waitForDownloadResult(); // This function internally uses polling & timeout

        if (_downloadErrorOccurred) {
          console.warn("Download failed - browser reported download error for:", fileTitle);
          throw new Error("Download failed for this file");
        }
        console.log("Download initiated/completed for", fileTitle);

        // Reset the DOM state before starting deletion (resetDomState might still use a delay internally)
        await resetDomState();

        // === DELETE STEPS ===

        updateIndicator(
          indicator,
          `Deleting file #${fileCount}: ${fileTitle}...`
        );
        console.log(`Beginning deletion for "${fileTitle}"...`);

        // Attempt to right-click the file element. rightClickWithRetry handles its own waits/retries.
        // It now dynamically waits for the menu instead of using fixed delay.
        await rightClickWithRetry(fileElement, 3); // No menu element needed here, just trigger it.

        // Wait for the "Delete" menu item to appear using the existing polling function.
        const deleteItem = await waitForDeleteMenuItem(15000); // This function already polls dynamically
        if (!deleteItem) {
          throw new Error(
            `Could not find 'Delete' menu item for "${fileTitle}"`
          );
        }

        // Click the "Delete" menu item. Wait for the item to disappear from the list.
        const initialFileCount =
          document.querySelectorAll(fileInfoSelector).length;
        await clickElement(deleteItem);

        // Instead of delay(4000), wait for the file element to be removed or count to decrease.
        try {
          await waitForCondition(
            () => {
              const currentFileCount =
                document.querySelectorAll(fileInfoSelector).length;
              const elementStillExists = document.body.contains(fileElement);
              // Condition met if element is gone OR file count decreased
              return !elementStillExists || currentFileCount < initialFileCount;
            },
            10000, // Wait up to 10 seconds for deletion
            `file element "${fileTitle}" removal`
          );
          console.log(`File "${fileTitle}" removed from DOM.`);
        } catch (e) {
          console.warn(
            `File "${fileTitle}" might not have been removed automatically after delete click. Attempting manual removal.`
          );
          // Force-remove if still present after timeout (existing logic)
          if (document.body.contains(fileElement)) {
            console.log(`Force-removing leftover item for: ${fileTitle}`);
            const liParent = fileElement.closest("li");
            if (liParent) {
              liParent.remove();
            } else {
              fileElement.remove();
            }
          }
        }

        // Reset the DOM state after deletion
        await resetDomState();

        // Mark the file as processed
        processedTitles.add(fileTitle);
        updateProgress(fileTitle);
        console.log(
          `File #${fileCount} ("${fileTitle}") exported & deleted successfully.`
        );
        errorCount = 0; // Reset error counter
      } catch (error) {
        errorCount++;
        console.error(
          `File #${fileCount} ("${fileTitle}") failed:`,
          error.message,
          error.stack // Log stack trace for better debugging
        );
        updateIndicator(
          indicator,
          `Error with file #${fileCount}: ${error.message.substring(0, 50)}...`,
          "error"
        );
        updateProgress(fileTitle, true); // Mark as errored

        // Attempt to clear UI state (resetDomState might be sufficient)
        try {
          await resetDomState(); // Try resetting state robustly
        } catch (e) {
          console.warn("Failed to clear UI state after error:", e);
          // Fallback: simple click and short delay if reset fails
          document.body.click();
          await delay(500);
        }

        // Mark the file as processed even if export/delete failed to avoid retrying it indefinitely
        processedTitles.add(fileTitle);

        console.log("Continuing with next file after error...");
        // No delay needed here, the loop will continue after the catch block
      }

      // Optional: Short delay between processing files if needed for stability, but maybe not required now.
      // await delay(500); // Reduced or removed delay
    }
  } finally {
    removeDownloadErrorListener();
    return stats;
  }
}

// --- setupDownloadErrorListener, removeDownloadErrorListener, waitForDownloadResult remain the same ---
/** Sets up a listener to detect download errors. */
function setupDownloadErrorListener() {
  _downloadErrorOccurred = false;
  _downloadErrorListener = function (event) {
    if (event.target.localName === "a" && event.type === "error") {
      console.error("Download error detected:", event);
      _downloadErrorOccurred = true;
    }
  };
  document.addEventListener("error", _downloadErrorListener, true);
  _originalConsoleError = console.error;
  console.error = function () {
    for (let i = 0; i < arguments.length; i++) {
      const arg = String(arguments[i]);
      if (arg.includes("download") && arg.includes("error")) {
        _downloadErrorOccurred = true;
        break;
      }
    }
    _originalConsoleError.apply(console, arguments);
  };
}
/** Removes the download error listener. */
function removeDownloadErrorListener() {
  if (_downloadErrorListener) {
    document.removeEventListener("error", _downloadErrorListener, true);
  }
  if (_originalConsoleError) {
    console.error = _originalConsoleError;
  }
}
/** Waits for download error flag or timeout. */
function waitForDownloadResult() {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (_downloadErrorOccurred) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve(); // Resolve anyway on timeout
    }, 10000); // 10-second timeout
  });
}
// --- End of unchanged functions ---
