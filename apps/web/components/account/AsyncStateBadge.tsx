"use client";

import { describeUnifiedAsyncState } from "../../lib/asyncStates";

type Props = {
  state: unknown;
  compact?: boolean;
};

export function AsyncStateBadge({ state, compact = false }: Props) {
  const presentation = describeUnifiedAsyncState(state);

  return (
    <span
      className={`async-state-badge${compact ? " async-state-badge-compact" : ""}`}
      data-state={presentation.code}
      title={presentation.detail}
    >
      {presentation.label}
    </span>
  );
}
