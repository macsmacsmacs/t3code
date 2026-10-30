import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { CommandId, ProjectId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ScheduledTasks from "../scheduledTasks/ScheduledTaskService.ts";
import * as ProjectService from "./ProjectService.ts";
import * as ThreadProjectMove from "./ThreadProjectMove.ts";

it.effect("waits for the requesting turn before switching its project", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("thread:move-after-turn");
    const source = ProjectId.make("project:source");
    const target = ProjectId.make("project:target");
    const runId = RunId.make("run:move-after-turn");
    const release = yield* Deferred.make<void>();
    const moved = yield* Deferred.make<unknown>();
    const settled = yield* Deferred.make<ThreadId>();
    const layerTest = ThreadProjectMove.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.mock(ThreadManagement.ThreadManagementService)({
            getThreadShell: () =>
              Effect.succeed({
                id: threadId,
                projectId: source,
                activeRunId: runId,
                providerInstanceId: ProviderInstanceId.make("codex"),
                deletedAt: null,
                lineage: { relationshipToParent: null },
              } as never),
            isProviderInstanceEnabledForProject: () => Effect.succeed(true),
            readShellSnapshot: () =>
              Effect.succeed(Effect.succeed({ threads: [], archivedThreads: [] } as never)),
            getThreadRecords: () => Effect.succeed({ subagents: [] } as never),
            waitForThread: () =>
              Deferred.await(release).pipe(
                Effect.as({ run: { id: runId, status: "completed" } } as never),
              ),
            dispatch: (command) =>
              Deferred.succeed(moved, command).pipe(
                Effect.as({ sequence: 1, storedEvents: [] } as never),
              ),
            settleThread: (input) =>
              Deferred.succeed(settled, input.threadId).pipe(Effect.as({ sequence: 2 })),
          }),
          Layer.mock(ProjectService.ProjectService)({
            getById: () =>
              Effect.succeedSome({ id: target, deletedAt: null, workspaceRoot: "/tmp" } as never),
          }),
          Layer.mock(ScheduledTasks.ScheduledTaskService)({
            list: () => Effect.succeed({ tasks: [] } as never),
          }),
        ),
      ),
      Layer.provide(NodeServices.layer),
    );
    yield* Effect.gen(function* () {
      const service = yield* ThreadProjectMove.ThreadProjectMove;
      const result = yield* service.move({
        threadId,
        projectId: target,
        commandId: CommandId.make("command:move-after-turn"),
        byOwnAgent: true,
        settleAfterMove: true,
      });
      expect(result).toEqual({ movesWhenTurnEnds: true });
      expect(yield* Deferred.isDone(moved)).toBe(false);
      yield* Deferred.succeed(release, undefined);
      expect(yield* Deferred.await(moved)).toMatchObject({
        type: "thread.project.move",
        threadId,
        projectId: target,
        expectedProjectId: source,
      });
      expect(yield* Deferred.await(settled)).toBe(threadId);
    }).pipe(Effect.provide(layerTest));
  }),
);

it.effect("refuses to strand a thread's scheduled tasks", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("thread:move-scheduled");
    const target = ProjectId.make("project:target");
    const layerTest = ThreadProjectMove.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.mock(ThreadManagement.ThreadManagementService)({
            getThreadShell: () =>
              Effect.succeed({
                id: threadId,
                projectId: ProjectId.make("project:source"),
                activeRunId: null,
                providerInstanceId: ProviderInstanceId.make("codex"),
                deletedAt: null,
                lineage: { relationshipToParent: null },
              } as never),
            isProviderInstanceEnabledForProject: () => Effect.succeed(true),
            readShellSnapshot: () =>
              Effect.succeed(Effect.succeed({ threads: [], archivedThreads: [] } as never)),
            getThreadRecords: () => Effect.succeed({ subagents: [] } as never),
          }),
          Layer.mock(ProjectService.ProjectService)({
            getById: () =>
              Effect.succeedSome({ id: target, deletedAt: null, workspaceRoot: "/tmp" } as never),
          }),
          Layer.mock(ScheduledTasks.ScheduledTaskService)({
            list: () => Effect.succeed({ tasks: [{ threadId }] } as never),
          }),
        ),
      ),
      Layer.provide(NodeServices.layer),
    );
    const result = yield* ThreadProjectMove.ThreadProjectMove.pipe(
      Effect.flatMap((service) =>
        service.move({
          threadId,
          projectId: target,
          commandId: CommandId.make("command:move-scheduled"),
          byOwnAgent: false,
        }),
      ),
      Effect.flip,
      Effect.provide(layerTest),
    );
    expect(result.reason).toContain("scheduled tasks");
  }),
);
