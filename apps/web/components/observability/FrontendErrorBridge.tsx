"use client";

import { useEffect } from "react";
import { normalizeFrontendErrorPayload, reportFrontendEvent } from "../../lib/observability";

export function FrontendErrorBridge() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      reportFrontendEvent("frontend_runtime_error", {
        ...normalizeFrontendErrorPayload(event.error || event.message),
        source: event.filename || null,
        line: event.lineno || null,
        column: event.colno || null,
      });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      reportFrontendEvent("frontend_unhandled_rejection", normalizeFrontendErrorPayload(event.reason));
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
