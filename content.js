/**
 * Immediately Invoked Async Function Expression (IIFE) to dynamically load modules.
 * This function sets up message listeners and event handlers for export and element selection actions.
 */
(async function loadModules() {
  console.log("Loading modules via dynamic import...");

  // Flag to indicate if the export process is running in background mode.
  let isBackgroundExporting = false;
  // Flag to signal when the export process should stop.
  let shouldStopExport = false;

  // Dynamically import the audio export module.
  const audioExportModule = await import(
    chrome.runtime.getURL("features/audioExport/audioExport.js")
  ).catch((error) => {
    console.error("❌ Failed to import audioExport:", error);
    throw new Error(`Failed to load audioExport module: ${error.message}`);
  });
  // Destructure the main export function from the module.
  const { runExportAll } = audioExportModule;

  // Dynamically import the element selector module.
  const elementSelectorModule = await import(
    chrome.runtime.getURL("features/elementSelector/elementSelector.js")
  ).catch((error) => {
    console.error("❌ Failed to import elementSelector:", error);
    throw new Error(`Failed to load elementSelector module: ${error.message}`);
  });
  // Destructure functions related to element selection.
  const {
    startElementSelector,
    stopElementSelector,
    clearSelectedElements,
    getSelectedElementsArray,
  } = elementSelectorModule;

  /**
   * Set up a listener for messages from other parts of the extension.
   * Handles various actions such as stopping exports, managing element selectors,
   * and initiating the export process.
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Validate sender is from our own extension
    if (sender.id !== chrome.runtime.id) {
      console.warn("Rejected message from unknown sender:", sender.id);
      return false;
    }

    // Handle request to stop the export process immediately.
    if (request.action === "stopExportProcess") {
      console.log(
        "Received stop signal, will stop after current file completes"
      );
      shouldStopExport = true;
      sendResponse({
        success: true,
        message: "Export will stop after current file completes.",
      });
      return false; // Return synchronously.
    }

    // Handle check for whether the export should stop.
    if (request.action === "checkShouldStop") {
      sendResponse({ shouldStop: shouldStopExport });
      return false; // Synchronous response.
    }

    // Start the element selector mode.
    if (request.action === "startElementSelector") {
      startElementSelector();
      sendResponse({ success: true, message: "Selector started." });
      return false;
    }

    // Stop the element selector mode.
    if (request.action === "stopElementSelector") {
      stopElementSelector();
      sendResponse({ success: true, message: "Selector stopped." });
      return false;
    }

    // Clear any selected elements in the UI.
    if (request.action === "clearSelectedElements") {
      clearSelectedElements();
      sendResponse({ success: true, message: "Elements cleared." });
      return false;
    }

    // Retrieve the array of selected elements.
    if (request.action === "getSelectedElements") {
      const elements = getSelectedElementsArray();
      sendResponse({ success: true, elements });
      return false;
    }

    // Handle the export process which may run for a longer time.
    if (request.action === "runExportAll") {
      // Set background mode if requested.
      isBackgroundExporting = !!request.background;
      // Reset the stop flag for a new export process.
      shouldStopExport = false;

      // Respond immediately to prevent timeouts.
      sendResponse({ success: true, message: "Export process starting..." });

      // Run the export process asynchronously without blocking the response.
      runExportAll(isBackgroundExporting)
        .then((result) => {
          // On successful completion, send the export results if running in background mode.
          if (isBackgroundExporting) {
            chrome.runtime
              .sendMessage({
                action: "exportComplete",
                data: result,
              })
              .catch((err) => {
                console.error("Failed to send completion message:", err);
              });
          }
        })
        .catch((error) => {
          console.error("Export all failed:", error);
          // Notify background script of the failure if in background mode.
          if (isBackgroundExporting) {
            chrome.runtime
              .sendMessage({
                action: "exportComplete",
                data: {
                  filesProcessed: 0,
                  filesErrored: 1,
                  error: error.message,
                },
              })
              .catch((err) => {
                console.error("Failed to send error message:", err);
              });
          }
        });

      return false; // Already responded synchronously.
    }

    // Default case for any unknown messages.
    return false;
  });

  /**
   * Prevent the page from unloading if an export is in progress.
   * This ensures the export process is not interrupted by user navigation.
   */
  window.addEventListener("beforeunload", function (e) {
    if (isBackgroundExporting) {
      e.preventDefault();
      e.returnValue = "Export is in progress. Are you sure you want to leave?";
      return e.returnValue;
    }
  });

  /**
   * Listen for changes in page visibility.
   * Log a message when the page becomes hidden while an export is running in the background.
   */
  document.addEventListener("visibilitychange", function () {
    if (isBackgroundExporting && document.visibilityState === "hidden") {
      console.log("Page hidden but export is running in background");
    }
  });
})();
