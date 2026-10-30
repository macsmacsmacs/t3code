import type { ScopedThreadRef } from "@t3tools/contracts";

import { cn } from "../lib/utils";
import { type ThreadAccent, useThreadAccent } from "../threadAccent";

export function ThreadAccentSwatch(props: {
  accent: ThreadAccent;
  className?: string | undefined;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", props.className)}
      style={{ backgroundColor: props.accent.color }}
    />
  );
}

/** Renders nothing for a thread with no accent. */
export function ThreadAccentDot(props: { threadRef: ScopedThreadRef; className?: string }) {
  const accent = useThreadAccent(props.threadRef);
  if (accent === null) return null;
  return (
    <span role="img" aria-label={`${accent.label} accent`} className="inline-flex shrink-0">
      <ThreadAccentSwatch accent={accent} className={props.className} />
    </span>
  );
}
