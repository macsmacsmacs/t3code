import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";
import {
  formatContextWindowCompactionMessage,
  formatContextWindowPercentage,
  isContextWindowOverloaded,
} from "./ContextWindowMeter.logic";

export function ContextWindowPanel(props: { usage: ContextWindowSnapshot | null }) {
  const { usage } = props;
  const maxTokens = usage?.maxTokens ?? null;
  const percentage = formatContextWindowPercentage(usage?.usedPercentage ?? null);
  const normalizedPercentage = Math.max(0, Math.min(100, usage?.usedPercentage ?? 0));
  const barColor = isContextWindowOverloaded(usage?.usedPercentage ?? null)
    ? "var(--color-error)"
    : "color-mix(in oklab, var(--color-muted-foreground) 72%, transparent)";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <h3 className="font-medium text-foreground text-sm">Context window</h3>
      {usage === null ? (
        <p className="text-muted-foreground text-sm">No usage reported yet</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-semibold text-2xl text-foreground tabular-nums">
              {formatContextWindowTokens(usage.usedTokens)}
              {maxTokens !== null ? (
                <span className="font-normal text-muted-foreground">
                  {" / "}
                  {formatContextWindowTokens(maxTokens)}
                </span>
              ) : null}
            </div>
            {percentage !== null && maxTokens !== null ? (
              <div className="text-secondary-label text-sm tabular-nums">{percentage}</div>
            ) : null}
          </div>
          {maxTokens !== null ? (
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(normalizedPercentage)}
              aria-label="Context window usage"
            >
              <div
                className="h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${normalizedPercentage}%`, backgroundColor: barColor }}
              />
            </div>
          ) : null}
          {usage.compactsAutomatically ? (
            <p className="text-pretty text-secondary-label text-xs">
              {formatContextWindowCompactionMessage(null, usage.autoCompactThreshold)}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
