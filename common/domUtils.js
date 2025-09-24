/**
 * common/domUtils.js
 */

/**
 * Returns a promise that resolves after a specified delay.
 * Useful for short pauses, visual feedback, or when no specific condition can be waited for.
 * Use sparingly in workflows; prefer waitForElement or waitForCondition.
 *
 * @param {number} ms - The delay duration in milliseconds.
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls the DOM until an element matching the selector is found and optionally meets a condition.
 *
 * @param {string} selector - The CSS selector for the element.
 * @param {number} [timeout=15000] - Maximum wait time in milliseconds.
 * @param {(element: Element) => boolean} [condition=() => true] - Optional function to check if the found element meets specific criteria (e.g., visibility, enabled state).
 * @returns {Promise<Element>} - The found element.
 * @throws {Error} - If the element is not found or the condition isn't met within the timeout.
 */
export async function waitForElement(
  selector,
  timeout = 15000,
  condition = () => true
) {
  const pollInterval = 250;
  let waited = 0;

  console.log(`Waiting for element: "${selector}" (timeout: ${timeout}ms)`);

  while (waited < timeout) {
    const element = document.querySelector(selector);
    if (element && condition(element)) {
      // Basic visibility check (can be enhanced)
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      ) {
        console.log(
          `Found element "${selector}" after ${waited} ms and condition met.`
        );
        return element;
      }
    }

    await delay(pollInterval); // Use delay for polling interval
    waited += pollInterval;
  }

  throw new Error(
    `Timeout waiting for element "${selector}" after ${timeout} ms.`
  );
}

/**
 * Polls until a specific condition function returns true.
 *
 * @param {() => boolean | Promise<boolean>} conditionFn - The function to evaluate. Should return true when the condition is met. Can be async.
 * @param {number} [timeout=15000] - Maximum wait time in milliseconds.
 * @param {string} [description="custom condition"] - Description for logging purposes.
 * @returns {Promise<void>}
 * @throws {Error} - If the condition isn't met within the timeout.
 */
export async function waitForCondition(
  conditionFn,
  timeout = 15000,
  description = "custom condition"
) {
  const pollInterval = 250;
  let waited = 0;

  console.log(
    `Waiting for condition: "${description}" (timeout: ${timeout}ms)`
  );

  while (waited < timeout) {
    if (await conditionFn()) {
      console.log(`Condition "${description}" met after ${waited} ms.`);
      return;
    }
    await delay(pollInterval); // Use delay for polling interval
    waited += pollInterval;
  }

  throw new Error(
    `Timeout waiting for condition "${description}" after ${timeout} ms.`
  );
}

/**
 * Finds the first element that matches the given XPath expression.
 * Waits briefly if not immediately found.
 *
 * @param {string} xpath - The XPath string to evaluate.
 * @param {number} [timeout=5000] - Maximum wait time in milliseconds.
 * @returns {Promise<Element|null>} - The first matching element or null if none found within timeout.
 */
export async function findElementByXPath(xpath, timeout = 5000) {
  let element = null;
  try {
    await waitForCondition(
      () => {
        element = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue;
        return !!element;
      },
      timeout,
      `XPath: ${xpath}`
    );
    return element;
  } catch (e) {
    // If timeout occurs, element will still be null.
    console.warn(`Element not found for XPath "${xpath}" within timeout.`);
    return null;
  }
}

/**
 * Simulates a click on a given element with visual feedback.
 * Scrolls the element into view, waits for it to be potentially stable, clicks, and waits for potential consequences.
 *
 * @param {Element} element - The DOM element to click.
 * @param {number} [postClickWaitMs=500] - Optional short delay after click for UI to react.
 */
export async function clickElement(element, postClickWaitMs = 500) {
  if (!element || typeof element.click !== "function") {
    throw new Error("Invalid element provided to clickElement");
  }

  // Scroll element into view smoothly
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  // Wait for the scroll to likely finish and element to be stable
  await delay(500); // Short delay for scroll animation

  // Save original style properties to restore later
  const originalOutline = element.style.outline;
  const originalZIndex = element.style.zIndex;

  // Apply visual feedback (optional, can be removed if not needed)
  element.style.outline = "3px solid rgba(255, 0, 0, 0.8)";
  element.style.zIndex = "9999";
  await delay(300); // Shorter delay for visual feedback flash

  try {
    // Attempt to click the element normally
    element.click();
    console.log(`Clicked element: ${element.tagName}#${element.id}`);
  } catch (clickError) {
    // Fallback: dispatch a click event if the normal click fails
    console.warn("Normal click failed, trying event dispatch...", clickError);
    const evt = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    element.dispatchEvent(evt);
    console.log(`Dispatched click event to: ${element.tagName}#${element.id}`);
  }

  // Restore the original style properties
  element.style.outline = originalOutline;
  element.style.zIndex = originalZIndex;

  // Optional short wait after the click for subsequent actions
  if (postClickWaitMs > 0) {
    await delay(postClickWaitMs);
  }
}

/**
 * Simulates a right-click (context menu click) on a given element.
 * Waits for the context menu to potentially appear afterwards.
 *
 * @param {Element} element - The DOM element to right-click.
 * @param {number} [postClickWaitMs=500] - Optional short delay after click for UI to react.
 * @returns {Promise<void>}
 */
export async function rightClickElement(element, postClickWaitMs = 500) {
  if (!element || typeof element.dispatchEvent !== "function") {
    throw new Error("Invalid element provided to rightClickElement");
  }
  // Scroll element into view to ensure visibility
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  await delay(500); // Wait for scroll

  // Save original style for later restoration
  const originalOutline = element.style.outline;
  const originalZIndex = element.style.zIndex;
  // Apply visual feedback (optional)
  element.style.outline = "3px solid rgba(0, 0, 255, 0.8)";
  element.style.zIndex = "9999";
  await delay(300); // Visual feedback delay

  // Create and dispatch a right-click (contextmenu) event
  const evt = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2, // Indicates right mouse button
    view: window,
  });
  element.dispatchEvent(evt);
  console.log(
    `Dispatched contextmenu event to: ${element.tagName}#${element.id}`
  );

  // Restore original styles
  element.style.outline = originalOutline;
  element.style.zIndex = originalZIndex;

  // Optional short wait after the click
  if (postClickWaitMs > 0) {
    await delay(postClickWaitMs);
  }
}

/**
 * Enhanced right-click function with retry logic and dynamic wait for context menu.
 * Attempts to trigger the context menu on the element, retrying up to maxRetries times if needed.
 *
 * @param {Element} element - The element to right-click.
 * @param {number} [maxRetries=3] - Maximum number of retry attempts.
 * @param {number} [menuWaitTimeout=5000] - Max time to wait for the menu after each click.
 * @returns {Promise<Element>} - Resolves with the context menu element if found.
 * @throws {Error} - If context menu cannot be triggered/found after retries.
 */
export async function rightClickWithRetry(
  element,
  maxRetries = 3,
  menuWaitTimeout = 5000
) {
  if (!element || typeof element.dispatchEvent !== "function") {
    throw new Error("Invalid element provided to rightClickWithRetry");
  }

  const menuSelector = ".context-menu, [role='menu']"; // Common selectors for context menus

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(
      `Right-click attempt ${attempt}/${maxRetries} on ${element.tagName}#${element.id}`
    );

    // Ensure the element is visible
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await delay(500); // Wait for scroll

    // Save current style properties for later restoration
    const originalOutline = element.style.outline;
    const originalZIndex = element.style.zIndex;

    try {
      // Apply visual indicator for the right-click attempt (optional)
      element.style.outline = "3px solid rgba(0, 0, 255, 0.8)";
      element.style.zIndex = "9999";
      await delay(300); // Visual feedback flash

      // Create and dispatch the right-click event
      const evt = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        view: window,
      });
      element.dispatchEvent(evt);
      console.log("Dispatched contextmenu event");

      // Restore styles immediately after dispatch
      element.style.outline = originalOutline;
      element.style.zIndex = originalZIndex;

      // Dynamically wait for the context menu to appear
      try {
        const menuElement = await waitForElement(menuSelector, menuWaitTimeout);
        console.log("Context menu appeared successfully.");
        return menuElement; // Return the found menu element
      } catch (waitError) {
        console.log(
          `Context menu didn't appear within ${menuWaitTimeout}ms on attempt ${attempt}.`
        );
        // Optional: Try clicking body to dismiss potential invisible menu before retrying
        document.body.click();
        await delay(100);
      }
    } catch (error) {
      console.error(`Error during right-click attempt ${attempt}:`, error);
      // Restore styles in case of error
      element.style.outline = originalOutline;
      element.style.zIndex = originalZIndex;
    }

    // Wait briefly before retrying
    if (attempt < maxRetries) {
      await delay(1000);
    }
  }

  // If all retries fail, throw an error
  throw new Error(
    `Failed to trigger and find context menu (${menuSelector}) after ${maxRetries} attempts.`
  );
}
