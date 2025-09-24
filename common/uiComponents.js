/**
 * Creates a status indicator element to display messages on the page.
 * The indicator is styled and fixed at the top-right corner.
 *
 * @returns {HTMLElement} The status indicator element.
 */
export function createStatusIndicator() {
  // Create a new div element to serve as the indicator.
  const indicator = document.createElement("div");
  // Apply inline CSS styles for positioning, appearance, and visibility.
  indicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background-color: rgba(33, 150, 243, 0.9);
        color: white;
        padding: 10px 15px;
        border-radius: 4px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        font-weight: bold;
        z-index: 9999;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      `;
  // Append the indicator to the document body so it's visible.
  document.body.appendChild(indicator);
  return indicator;
}

/**
 * Updates the status indicator with a new message and visual style.
 *
 * @param {HTMLElement} indicator - The status indicator element.
 * @param {string} message - The message to display.
 * @param {string} [type="info"] - The type of message ("info", "success", "error").
 */
export function updateIndicator(indicator, message, type = "info") {
  // Update the text content of the indicator.
  indicator.textContent = message;
  // Update the background color based on the message type.
  switch (type) {
    case "success":
      indicator.style.backgroundColor = "rgba(76, 175, 80, 0.9)"; // Green for success.
      break;
    case "error":
      indicator.style.backgroundColor = "rgba(244, 67, 54, 0.9)"; // Red for errors.
      break;
    default:
      indicator.style.backgroundColor = "rgba(33, 150, 243, 0.9)"; // Blue for info/other.
  }
}
