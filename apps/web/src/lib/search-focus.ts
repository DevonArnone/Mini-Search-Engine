// Coordinates the global "focus search" shortcut with whichever search input
// is on the page. When no input is mounted yet (the shortcut navigated to the
// search page), the next input to mount takes focus.

const SELECTOR = "[data-search-input]";
let focusOnMount = false;

export function focusSearchInput(): boolean {
  const input = document.querySelector<HTMLInputElement>(SELECTOR);
  if (!input) return false;
  input.focus();
  input.select();
  return true;
}

export function requestSearchFocus() {
  focusOnMount = true;
}

export function consumeSearchFocusRequest(): boolean {
  const requested = focusOnMount;
  focusOnMount = false;
  return requested;
}

// True when a keystroke is going into something the user is typing in.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
