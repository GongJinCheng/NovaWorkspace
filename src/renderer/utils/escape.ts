/**
 * HTML / attribute escape helpers.
 * Uses the browser's built-in encoding where possible.
 */

/**
 * Escape HTML special characters for safe innerHTML insertion.
 * Uses a temporary DOM element so the browser does the encoding.
 */
export function escHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Escape a string for use inside an HTML attribute value (double-quoted).
 * Escapes &, ", <, > and backticks.
 */
export function escAttr(str: string): string {
  return escHtml(str).replace(/"/g, '&quot;').replace(/`/g, '&#96;');
}
