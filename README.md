# Plaud.ai Audio Exporter

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

## 📖 Project Overview

The Plaud.ai Audio Exporter is a Chrome extension that automates the process of exporting audio files from the Plaud.ai web application. It enables users to batch export audio content with a single click, handling the entire export workflow including audio format selection, download management, and optional post-export cleanup.

### Key Features

- **One-Click Audio Export**: Automates the entire export process that would typically require multiple manual clicks
- **Background Processing**: Continue working in other tabs while exports run in the background
- **Batch Processing**: Export multiple files sequentially without manual intervention
- **Element Selection**: Interactive tool to identify and select DOM elements for custom automation
- **Visual Feedback**: Clear status indicators and notifications throughout the export process
- **Error Handling**: Robust error recovery to continue batch operations even if individual files fail
- **Export Statistics**: Track progress with detailed statistics on processed files

### Technologies Used

- **Chrome Extension API**: Manifest V3 with service worker architecture
- **JavaScript ES Modules**: Modern module imports for code organization
- **DOM Manipulation**: Advanced interaction with web page elements
- **Message Passing**: Communication between background, content scripts, and popup UI
- **Chrome Notifications**: User alerts for export status updates

## 🚀 Getting Started

### Prerequisites

- Google Chrome browser (version 88 or higher recommended)
- Developer mode enabled in Chrome extensions

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/plaud-exporter.git
   cd plaud-exporter
   ```

2. **Load the extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" using the toggle in the top-right corner
   - Click "Load unpacked" and select the project directory

3. **Verify installation**
   - You should see the Plaud.ai Audio Exporter extension in your extensions list
   - The extension icon should appear in your Chrome toolbar

### Usage

1. **Navigate to your Plaud.ai account**
   - Go to https://app.plaud.ai/ and log in to your account

2. **Open the extension popup**
   - Click the extension icon in the Chrome toolbar
   - The popup interface will show export controls and element selector tools

3. **Start an export**
   - Click "Export All Files" for a foreground export (requires keeping the tab active)
   - Or click "Export in Background" to continue working in other tabs

4. **Monitor progress**
   - The extension will show real-time statistics about the export
   - Chrome notifications will alert you of major events (export started/completed/errors)

## 🗂 File & Folder Structure

```
plaud-exporter/
├── manifest.json              # Extension configuration and metadata
├── background.js              # Service worker for managing background exports
├── content.js                 # Main content script entry point
├── popup/
│   ├── popup.html             # User interface HTML structure
│   ├── popup.js               # Popup functionality and event handlers
│   └── popup.css              # Styles for the popup interface
├── features/
│   ├── audioExport/
│   │   ├── audioExport.js     # Main audio export workflow implementation
│   │   ├── audioExportUtils.js # Helper functions for export functionality (currently similar to deleteHelpers.js)
│   │   └── deleteHelpers.js   # Utilities for post-export deletion
│   └── elementSelector/
│       ├── elementSelector.js # Element selection mode management
│       └── selectorUtils.js   # Element selection utilities and info extraction
├── common/
│   ├── domUtils.js            # DOM interaction utilities
│   ├── uiComponents.js        # UI component creation and updates
│   └── storageUtils.js        # Data storage utilities (placeholders)
└── assets/
    └── icons/
        ├── icon16.png         # Extension icon (16×16)
        ├── icon48.png         # Extension icon (48×48)
        └── icon128.png        # Extension icon (128×128)
```

## 📄 File-by-File Descriptions

### manifest.json

The configuration file that defines the extension's metadata, permissions, and capabilities. It specifies:

- Extension name, version, and description
- Required permissions (`activeTab`, `scripting`, `clipboardWrite`, `notifications`)
- Background service worker configuration
- Content scripts targeting `https://app.plaud.ai/*`
- Popup interface location
- Web-accessible resources for dynamically imported modules

Key settings:
```json
{
    "manifest_version": 3,
    "name": "Plaud.ai Audio Exporter",
    "version": "1.0",
    "permissions": [
        "activeTab",
        "scripting",
        "clipboardWrite",
        "notifications"
    ],
    "background": {
        "service_worker": "background.js",
        "type": "module"
    }
}
```

### background.js

The service worker that manages background processes for the extension. It handles:

- Tracking active exports across multiple tabs
- Managing export lifecycle and statistics
- Processing messages between the extension components
- Keeping tabs alive during background exports
- Generating system notifications for export events
- Stopping exports when requested by the user

Core functions:
- `keepTabAlive`: Ensures background exports continue even when tab is not visible
- Message listeners for actions like `startBackgroundExport`, `stopExport`, `checkShouldStop`, etc.
- Monitoring for stalled exports after periods of inactivity

### content.js

The main content script injected into the Plaud.ai web application. It:

- Dynamically imports feature modules using ES6 imports
- Sets up message handlers to communicate with popup and background script
- Manages state for background exports
- Prevents accidental page navigation during active exports
- Handles visibility changes for when the tab is in the background

Key excerpt:
```javascript
(async function loadModules() {
  // Track whether export is running in background mode
  let isBackgroundExporting = false;
  let shouldStopExport = false;

  // Dynamically import modules
  const audioExportModule = await import(
    chrome.runtime.getURL("features/audioExport/audioExport.js")
  ).catch((error) => {
    console.error("❌ Failed to import audioExport:", error);
    throw new Error(`Failed to load audioExport module: ${error.message}`);
  });
  const { runExportAll } = audioExportModule;

  // Set up message listeners
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle various message types...
  });
})();
```

### features/audioExport/audioExport.js

The core functionality for exporting audio files from Plaud.ai. It implements:

- `runExportAll`: The main function that automates the export workflow
- Visual feedback through status indicators
- Progress tracking and statistics gathering
- Error handling with automatic recovery
- DOM interaction sequences to trigger exports
- Downloads handling and error detection
- Post-export cleanup (deletion) workflow

The function follows these steps for each file:
1. Click on the file to select it
2. Click the share icon
3. Select "Export Audio" option
4. Select MP3 format
5. Click the export button
6. Wait for download to complete
7. Right-click the file and select delete option
8. Wait for deletion to complete
9. Move on to the next file

### features/audioExport/deleteHelpers.js

Utilities for the post-export deletion process:

- `waitForDeleteMenuItem`: Polls for the appearance of a "Delete" menu item
- `findElementByText`: A fallback method for finding elements by text content
- `resetDomState`: Cleans up the UI state between operations

### features/audioExport/audioExportUtils.js

Helper functions for the export process.
**Note:** Currently, this file duplicates much of the functionality of **deleteHelpers.js**. Future iterations may introduce more distinct export-specific utilities.

### features/elementSelector/elementSelector.js

Manages the element selection functionality:

- Controls for starting and stopping selection mode
- Visual indicators for selection mode
- Storage for selected elements
- Exports functions like `startElementSelector`, `stopElementSelector`, `clearSelectedElements`

### features/elementSelector/selectorUtils.js

Utilities for the element selection process:

- Event handlers for element hover, click
- Functions to extract element properties (XPath, CSS selector, attributes)
- Visual highlighting for selected elements

### common/domUtils.js

DOM manipulation utilities used throughout the extension:

- `clickElement`: Simulates user clicks with visual feedback
- `rightClickElement`/`rightClickWithRetry`: Robust context menu activation
- `delay`: Promise-based timing control
- `findElementByXPath`: XPath-based element lookup

Example of the click function with visual feedback:
```javascript
export async function clickElement(element) {
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  await delay(1000);

  const originalOutline = element.style.outline;
  const originalZIndex = element.style.zIndex;
  element.style.outline = "3px solid rgba(255, 0, 0, 0.8)";
  element.style.zIndex = "9999";
  await delay(1000);

  try {
    element.click();
  } catch (clickError) {
    console.log("Normal click failed, trying event dispatch...");
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
    element.dispatchEvent(evt);
  }
  await delay(1000);

  element.style.outline = originalOutline;
  element.style.zIndex = originalZIndex;
}
```

### common/uiComponents.js

UI component creation and management:

- `createStatusIndicator`: Creates a floating status indicator
- `updateIndicator`: Updates the indicator with different status types (info, success, error)

### common/storageUtils.js

Placeholder for future data storage functionality:

- Currently contains mock implementations of `saveData`, `loadData`, `clearData`

### popup/popup.html

The HTML structure for the extension's popup interface:

- Export control buttons
- Element selector controls
- Status display areas
- Selected elements display section
- Export statistics section

### popup/popup.js

JavaScript for the popup interface functionality:

- Event handlers for all popup buttons
- Communication with content script and background script
- Updating UI based on export status
- Element selection display and management
- Export progress monitoring
- Clipboard operations for selected elements

### popup/popup.css

CSS styles for the popup interface:

- Button styling for different states (active, disabled, etc.)
- Status indicator styling for different message types
- Layout and visual organization of the UI
- Animation and interactive elements

## 💻 Available Commands & Usage Examples

The extension is operated primarily through its popup interface, but you can also interact with it programmatically by sending messages to the content script.

### Popup Interface Controls

- **Export All Files**: Starts a foreground export process
  - Requires the tab to remain focused during the export
  - Progress is visible in the current tab

- **Export in Background**: Starts a background export process
  - Can continue working in other tabs
  - Export will continue even if the popup is closed
  - Notifications will alert you to progress and completion

- **Stop Export**: Stops an active export process
  - Current file will complete before stopping
  - Cannot be resumed; must restart from the beginning

- **Start/Stop Selector**: Toggles element selection mode
  - When active, allows clicking on page elements to identify them
  - Useful for debugging or creating custom workflows

- **Clear Elements**: Clears the list of selected elements

- **Copy Elements**: Copies information about selected elements to clipboard
  - Includes XPath, CSS selector, class/ID info, and text content

### Programmatic Control

To control the extension from the console for testing or debugging:

**Start an export:**
```javascript
chrome.runtime.sendMessage({
  action: "startBackgroundExport",
  tabId: chrome.tabs.getCurrent(tab => tab.id)
});
```

**Stop an export:**
```javascript
chrome.runtime.sendMessage({
  action: "stopExport",
  tabId: chrome.tabs.getCurrent(tab => tab.id)
});
```

**Check export status:**
```javascript
chrome.runtime.sendMessage({
  action: "getExportStatus",
  tabId: chrome.tabs.getCurrent(tab => tab.id)
}, response => console.log('Export status:', response));
```

## ⚙️ Configuration & Environment

The extension does not require explicit configuration files or environment variables. All settings are contained within the manifest.json file.

### Extension Permissions

The extension requires the following permissions:

- **activeTab**: To interact with the current tab
- **scripting**: To execute scripts in the web page context
- **clipboardWrite**: To copy element information to clipboard
- **notifications**: To display system notifications for export events

### Deployment Options

For production deployment:

1. Create a zip file of the entire project directory
2. Submit to the Chrome Web Store following their [developer documentation](https://developer.chrome.com/docs/webstore/publish/)

For local development, "Load unpacked" is the preferred method, as described in the Getting Started section.

## 📌 Additional Notes

### Target Website Specificity

This extension is specifically designed for the Plaud.ai web application. The DOM selectors, XPaths, and workflow are tailored to this specific site's structure as of the development date.

If the Plaud.ai website undergoes significant UI changes, the extension may require updates to the selectors and workflow steps.

### Error Handling Strategy

The extension employs a progressive failure approach:
- Individual file failures don't stop the entire batch process
- Retry logic is built into critical functions like right-clicking
- Fallback approaches when primary methods fail (e.g., finding elements by text when XPath fails)

### Performance Considerations

- Background exports are designed to keep tabs alive without causing excessive resource usage
- The extension monitors for stalled exports and will alert the user after 2 minutes of inactivity
- Visual feedback (highlighted elements) is cleaned up after operations to avoid DOM pollution

### Future Enhancements

Potential areas for future development:

- **Storage Implementation**: The storageUtils.js file contains placeholders for future data persistence
- **Custom Export Templates**: Allow users to define and save custom export settings
- **Batch Size Controls**: Add options to limit the number of files processed in a single batch
- **Advanced Element Selection**: Enhance the element selector with filtering and grouping capabilities

### Debugging Tips

If you encounter issues:

1. Check the background page console:
   - Go to `chrome://extensions/`
   - Find the extension and click "service worker" under "Inspect views"

2. Monitor content script logs:
   - Right-click on the Plaud.ai page and select "Inspect"
   - Navigate to the Console tab
   - Look for logs prefixed with extension-related messages

3. Test element selection:
   - Use the element selector feature to verify XPaths and CSS selectors
   - Copy element details to diagnose selection issues