import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadProjectionFixture } from "../test-fixtures";
import { threadTokenTotalsByModel } from "./threadCost";

type Turn = OrchestrationV2ThreadProjection["providerTurns"][number];

function turn(runAttemptId: string | null, usage: Turn["turnTokenUsage"]): Turn {
  return { runAttemptId, turnTokenUsage: usage } as Turn;
}

describe("threadTokenTotalsByModel", () => {
  it("sums turns under each run's model and splits cached input out", () => {
    const projection = makeThreadProjectionFixture();
    const totals = threadTokenTotalsByModel({
      ...projection,
      runs: [
        { id: "run-1", modelSelection: { model: "claude-opus-5-5" } },
        { id: "run-2", modelSelection: { model: "claude-haiku-5-5" } },
      ] as never,
      attempts: [
        { id: "attempt-1", runId: "run-1" },
        { id: "attempt-2", runId: "run-2" },
      ] as never,
      providerTurns: [
        turn("attempt-1", {
          usageScope: "main_agent",
          usageStatus: "complete",
          inputTokens: 1000,
          cachedInputTokens: 600,
          cacheCreationTokens: 100,
          outputTokens: 50,
          hasSubagents: false,
        }),
        turn("attempt-1", {
          usageScope: "main_agent",
          usageStatus: "complete",
          inputTokens: 500,
          outputTokens: 10,
          hasSubagents: true,
        }),
        turn("attempt-2", {
          usageScope: "main_agent",
          usageStatus: "unavailable",
          hasSubagents: false,
        }),
        // No attempt: the thread's model prices it.
        turn(null, {
          usageScope: "main_agent",
          usageStatus: "complete",
          inputTokens: 20,
          outputTokens: 5,
          hasSubagents: false,
        }),
      ],
    });

    expect(totals).toEqual({
      items: [
        {
          model: "claude-opus-5-5",
          totals: {
            uncachedInputTokens: 800,
            cachedInputTokens: 600,
            cacheCreationTokens: 100,
            outputTokens: 60,
            reasoningTokens: 0,
          },
        },
        {
          model: "gpt-5.4",
          totals: {
            uncachedInputTokens: 20,
            cachedInputTokens: 0,
            cacheCreationTokens: 0,
            outputTokens: 5,
            reasoningTokens: 0,
          },
        },
      ],
      incomplete: true,
      hasSubagents: true,
    });
  });
});
