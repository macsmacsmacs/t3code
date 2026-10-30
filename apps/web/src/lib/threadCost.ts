import type { OrchestrationV2ThreadProjection, UsagePriceTokensInput } from "@t3tools/contracts";

type Totals = UsagePriceTokensInput["items"][number]["totals"];

export interface ThreadTokenTotals {
  readonly items: UsagePriceTokensInput["items"];
  /** Some turns reported no token counts, so the total is a floor. */
  readonly incomplete: boolean;
  /** Subagent tokens are not in the per-turn counts. */
  readonly hasSubagents: boolean;
}

/** Sums each provider turn's main-agent tokens under the model its run used. */
export function threadTokenTotalsByModel(
  projection: Pick<OrchestrationV2ThreadProjection, "runs" | "attempts" | "providerTurns"> & {
    readonly thread: Pick<OrchestrationV2ThreadProjection["thread"], "modelSelection">;
  },
): ThreadTokenTotals | null {
  const byModel = new Map<string, Totals>();
  let incomplete = false;
  let hasSubagents = false;
  for (const turn of projection.providerTurns) {
    const usage = turn.turnTokenUsage;
    if (usage === undefined) continue;
    if (usage.hasSubagents) hasSubagents = true;
    if (usage.inputTokens === undefined || usage.outputTokens === undefined) {
      incomplete = true;
      continue;
    }
    if (usage.usageStatus !== "complete") incomplete = true;
    const runId = projection.attempts.find((attempt) => attempt.id === turn.runAttemptId)?.runId;
    const model =
      projection.runs.find((run) => run.id === runId)?.modelSelection.model ??
      projection.thread.modelSelection.model;
    const cached = usage.cachedInputTokens ?? 0;
    const cacheCreation = usage.cacheCreationTokens ?? 0;
    const previous = byModel.get(model);
    byModel.set(model, {
      uncachedInputTokens:
        (previous?.uncachedInputTokens ?? 0) +
        Math.max(0, usage.inputTokens - cached - cacheCreation),
      cachedInputTokens: (previous?.cachedInputTokens ?? 0) + cached,
      cacheCreationTokens: (previous?.cacheCreationTokens ?? 0) + cacheCreation,
      outputTokens: (previous?.outputTokens ?? 0) + usage.outputTokens,
      reasoningTokens: (previous?.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0),
    });
  }
  if (byModel.size === 0) return null;
  return {
    items: [...byModel].map(([model, totals]) => ({ model, totals })),
    incomplete,
    hasSubagents,
  };
}
