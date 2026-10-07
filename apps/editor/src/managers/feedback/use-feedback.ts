import { useRef, useState } from "react";

import type { TelemetryManager } from "$/managers/telemetry/telemetry-manager";

export enum FeedbackCategory {
  FeatureRequest = "feature_request",
  Bug = "bug",
  Other = "other",
}

/** Keeps an unsent draft across dialog openings for this workspace session. */
export function useFeedback(telemetry: TelemetryManager, onSubmitted: () => void) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(FeedbackCategory.FeatureRequest);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);

  const close = () => {
    if (!submitting.current) setOpen(false);
  };

  const submit = async () => {
    const content = message.trim();
    if (!content || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await telemetry.submitFeedback({
        category,
        message: content,
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      setMessage("");
      setEmail("");
      setCategory(FeedbackCategory.FeatureRequest);
      setOpen(false);
      onSubmitted();
    } catch {
      setFailed(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return {
    open,
    show: () => {
      setFailed(false);
      setOpen(true);
    },
    close,
    category,
    setCategory,
    message,
    setMessage,
    email,
    setEmail,
    busy,
    failed,
    submit,
  };
}

export type FeedbackController = ReturnType<typeof useFeedback>;
