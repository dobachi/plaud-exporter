// Wait until the DOM content is fully loaded before executing script logic
document.addEventListener("DOMContentLoaded", function () {
  // Retrieve UI elements from the popup HTML
  const exportAllBtn = document.getElementById("exportAllBtn");
  const exportBgBtn = document.getElementById("exportBgBtn"); // Button for background export
  const stopExportBtn = document.getElementById("stopExportBtn"); // Button to stop background exports
  const startSelectorBtn = document.getElementById("startSelector");
  const clearElementsBtn = document.getElementById("clearElements");
  const copyElementsBtn = document.getElementById("copyElements");

  const selectedElementsContainer = document.getElementById("selectedElements");
  const elementDetailsContainer = document.getElementById("elementDetails");
  const statusEl = document.getElementById("status");
  const exportStatusContainer = document.getElementById("exportStatus"); // Container for export status display

  // Variables to track state
  let selectedElements = [];
  let selectorActive = false;
  let exportActive = false;

  // On popup open, check if an export is already active in the current tab
  checkExportStatus();

  // -----------------------------
  // Standard (foreground) export
  // -----------------------------
  exportAllBtn.addEventListener("click", function () {
    // Query the currently active tab
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      // Send a message to the content script to start export in foreground mode
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "runExportAll", background: false },
        (response) => {
          if (response && response.success) {
            updateStatus("Export process started!", "info");
          } else {
            updateStatus(
              "Error exporting: " + (response?.error || "Unknown"),
              "error"
            );
          }
        }
      );
    });
  });

  // -----------------------------
  // Background export
  // -----------------------------
  exportBgBtn.addEventListener("click", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      // Send a message to the background service worker to start background export
      chrome.runtime.sendMessage(
        {
          action: "startBackgroundExport",
          tabId: tabs[0].id,
        },
        (response) => {
          if (response && response.success) {
            updateStatus(
              "Background export started! You can close this popup and continue working.",
              "success"
            );
            exportActive = true;
            updateExportControls();
          } else {
            updateStatus("Error starting background export.", "error");
          }
        }
      );
    });
  });

  // -----------------------------
  // Stop export process
  // -----------------------------
  stopExportBtn.addEventListener("click", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      // Send a message to stop the export process
      chrome.runtime.sendMessage(
        {
          action: "stopExport",
          tabId: tabs[0].id,
        },
        (response) => {
          if (response && response.success) {
            updateStatus(
              "Export stopping after current file completes.",
              "info"
            );
            exportActive = false;
            updateExportControls();
          }
        }
      );
    });
  });

  // -----------------------------
  // Element Selector Start/Stop
  // -----------------------------
  startSelectorBtn.addEventListener("click", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!selectorActive) {
        // Start element selection mode via content script message
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "startElementSelector" },
          (response) => {
            if (response && response.success) {
              selectorActive = true;
              startSelectorBtn.textContent = "Stop Selector";
              startSelectorBtn.classList.add("active");
              updateStatus("Element selector activated.", "info");
            }
          }
        );
      } else {
        // Stop element selection mode
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "stopElementSelector" },
          (response) => {
            if (response && response.success) {
              selectorActive = false;
              startSelectorBtn.textContent = "Start Selector";
              startSelectorBtn.classList.remove("active");
              updateStatus("Element selector deactivated.", "info");
            }
          }
        );
      }
    });
  });

  // -----------------------------
  // Clear Selected Elements
  // -----------------------------
  clearElementsBtn.addEventListener("click", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "clearSelectedElements" },
        (response) => {
          if (response && response.success) {
            selectedElements = [];
            updateSelectedElementsList();
            updateStatus("Selected elements cleared.", "info");
          }
        }
      );
    });
  });

  // -----------------------------
  // Copy Element Information
  // -----------------------------
  copyElementsBtn.addEventListener("click", function () {
    if (selectedElements.length === 0) {
      updateStatus("No elements selected to copy.", "error");
      return;
    }
    // Concatenate element details into a formatted string
    const elementInfo = selectedElements
      .map((el, index) => {
        return `Element ${index + 1} (${el.tagName}):
          XPath: ${el.xPath}
          CSS Selector: ${el.cssSelector}
          Class: ${el.className}
          ID: ${el.id}
          Text: ${el.innerText}
          HTML: ${el.outerHTML}`;
      })
      .join("\n--------------\n\n");

    // Use the Clipboard API to copy element information
    navigator.clipboard.writeText(elementInfo).then(
      () => updateStatus("Element info copied to clipboard!", "success"),
      () => updateStatus("Failed to copy to clipboard.", "error")
    );
  });

  // -----------------------------
  // Load Selected Elements from Content Script
  // -----------------------------
  function loadSelectedElements() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "getSelectedElements" },
        (response) => {
          if (response && response.success) {
            selectedElements = response.elements;
            updateSelectedElementsList();
          }
        }
      );
    });
  }

  // Update the UI list showing selected elements
  function updateSelectedElementsList() {
    selectedElementsContainer.innerHTML = "";
    if (selectedElements.length === 0) {
      const emptyItem = document.createElement("div");
      emptyItem.className = "element-item empty";
      emptyItem.textContent = "No elements selected yet.";
      selectedElementsContainer.appendChild(emptyItem);
      return;
    }

    // For each selected element, create an item in the UI
    selectedElements.forEach((element, index) => {
      const item = document.createElement("div");
      item.className = "element-item";
      item.innerHTML = `<strong>Element ${index + 1}:</strong> ${
        element.tagName
      } - ${
        element.innerText ? element.innerText.substring(0, 30) : "[No text]"
      }`;

      // Add click handler to toggle display of detailed element info
      item.addEventListener("click", function () {
        const detailsId = "details-" + index;
        const existingDetails = document.getElementById(detailsId);
        if (existingDetails) {
          // Toggle details visibility if already exists
          existingDetails.classList.toggle("active");
        } else {
          // Close any open details first
          document
            .querySelectorAll(".element-details")
            .forEach((el) => el.classList.remove("active"));

          // Create and display new element details
          const details = document.createElement("div");
          details.id = detailsId;
          details.className = "element-details active";
          details.innerHTML = `
                    <strong>Tag:</strong> ${element.tagName}<br>
                    <strong>XPath:</strong> ${element.xPath}<br>
                    <strong>CSS Selector:</strong> ${element.cssSelector}<br>
                    <strong>Class:</strong> ${element.className}<br>
                    <strong>ID:</strong> ${element.id}<br>
                    <strong>Text:</strong> ${element.innerText}<br>
                    <strong>HTML:</strong> <pre>${escapeHtml(
                      element.outerHTML
                    )}</pre>
                  `;
          elementDetailsContainer.innerHTML = "";
          elementDetailsContainer.appendChild(details);
        }
      });
      selectedElementsContainer.appendChild(item);
    });
  }

  // Utility function to escape HTML characters for safe display
  function escapeHtml(html) {
    return html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Display a temporary status message in the popup
  function updateStatus(message, type = "info") {
    statusEl.textContent = message;
    statusEl.className = "status " + type;
    // Clear the status message after 5 seconds
    setTimeout(() => {
      statusEl.textContent = "";
      statusEl.className = "status";
    }, 5000);
  }

  // -----------------------------
  // Export Status Functions
  // -----------------------------

  // Check if there's an active export process in the current tab
  function checkExportStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.runtime.sendMessage(
        {
          action: "getExportStatus",
          tabId: tabs[0].id,
        },
        (response) => {
          if (response && response.success) {
            exportActive = response.isRunning;

            if (exportActive && response.exportData) {
              // Display export status if export is active
              updateExportStatus(response.exportData);
              // Begin polling for further status updates
              startStatusPolling();
            }

            // Update UI controls based on export status
            updateExportControls();
          }
        }
      );
    });
  }

  // Update the export status display using export data
  function updateExportStatus(data) {
    if (!exportStatusContainer) return;

    // Hide the container if no data or export is stopped
    if (!data || data.status === "stopped") {
      exportStatusContainer.innerHTML = "";
      exportStatusContainer.style.display = "none";
      return;
    }

    // Make sure the container is visible
    exportStatusContainer.style.display = "block";

    // Calculate elapsed time since export started
    const elapsedSeconds = Math.floor((Date.now() - data.startTime) / 1000);
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const timeString = `${minutes}m ${seconds}s`;

    // Update the container with current export status details
    exportStatusContainer.innerHTML = `
          <h3>Export in Progress</h3>
          <div class="status-item">
            <span>Files Processed:</span>
            <span>${data.filesProcessed}</span>
          </div>
          <div class="status-item">
            <span>Errors:</span>
            <span>${data.filesErrored}</span>
          </div>
          <div class="status-item">
            <span>Running Time:</span>
            <span>${timeString}</span>
          </div>
        `;
  }

  // Enable or disable export-related control buttons based on export state
  function updateExportControls() {
    if (exportActive) {
      exportAllBtn.disabled = true;
      exportBgBtn.disabled = true;
      stopExportBtn.disabled = false;
      stopExportBtn.style.display = "block";
    } else {
      exportAllBtn.disabled = false;
      exportBgBtn.disabled = false;
      stopExportBtn.disabled = true;
      stopExportBtn.style.display = "none";
    }
  }

  // -----------------------------
  // Polling for Export Status Updates
  // -----------------------------
  let statusPollingInterval = null;
  function startStatusPolling() {
    // Clear any existing polling interval
    if (statusPollingInterval) {
      clearInterval(statusPollingInterval);
    }

    // Poll for export status every 2 seconds
    statusPollingInterval = setInterval(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.runtime.sendMessage(
          {
            action: "getExportStatus",
            tabId: tabs[0].id,
          },
          (response) => {
            if (response && response.success) {
              exportActive = response.isRunning;

              if (exportActive && response.exportData) {
                // Update the export status display
                updateExportStatus(response.exportData);
              } else {
                // Stop polling if export is no longer active
                clearInterval(statusPollingInterval);
                statusPollingInterval = null;
                exportActive = false;
                updateExportControls();
                updateExportStatus(null);
              }
            }
          }
        );
      });
    }, 2000);
  }

  // Initial load of selected elements from the content script
  loadSelectedElements();

  // Listen for messages from content scripts (e.g., element selection updates, selector mode changes, export updates)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "elementSelected") {
      // Append the new selected element info and update UI list
      selectedElements.push(request.elementInfo);
      updateSelectedElementsList();
      updateStatus(`Element ${selectedElements.length} selected!`, "success");
    } else if (request.action === "selectorModeStatus") {
      // Update selector mode status and UI based on the content script's response
      selectorActive = request.isActive;
      startSelectorBtn.textContent = selectorActive
        ? "Stop Selector"
        : "Start Selector";
      startSelectorBtn.className = selectorActive ? "active" : "";
      updateStatus(request.message, "info");
    } else if (request.action === "exportStatusUpdate") {
      // Update the export status display when a new update is received
      updateExportStatus(request.data);
    }
    return true;
  });
});
