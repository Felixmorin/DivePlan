import { isExternalWebVitalsError } from "@/lib/client-errors";

// This runs before hydration, so injected analytics failures do not get
// mistaken for errors raised by DivePlan or displayed by the dev overlay.
window.addEventListener(
  "error",
  (event) => {
    if (isExternalWebVitalsError(event.error)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true
);
