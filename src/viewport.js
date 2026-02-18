const VIEWPORT_OFFSET_VAR = "--viewport-offset-bottom";

export function updateViewportOffsetBottom() {
  const root = document.documentElement;
  const viewport = window.visualViewport;

  if (!viewport) {
    root.style.setProperty(VIEWPORT_OFFSET_VAR, "0px");
    return;
  }

  const keyboardHeight = Math.max(
    0,
    window.innerHeight - (viewport.height + viewport.offsetTop)
  );
  root.style.setProperty(VIEWPORT_OFFSET_VAR, `${keyboardHeight}px`);
}
