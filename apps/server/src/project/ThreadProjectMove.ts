import {
  CommandId,
  type ProjectId,
  type ProviderInstanceId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ScheduledTasks from "../scheduledTasks/ScheduledTaskService.ts";
import * as ProjectService from "./ProjectService.ts";

export class ThreadProjectMoveError extends Schema.TaggedError<ThreadProjectMoveError>()(
  "ThreadProjectMoveError",
  { reason: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return this.reason;
  }
}

export class ThreadProjectMove extends Context.Service<
  ThreadProjectMove,
  {
    readonly move: (input: {
      readonly threadId: ThreadId;
      readonly projectId: ProjectId;
      readonly commandId: CommandId;
      readonly byOwnAgent: boolean;
      readonly settleAfterMove?: boolean;
    }) => Effect.Effect<
      { readonly sequence: number } | { readonly movesWhenTurnEnds: true },
      ThreadProjectMoveError
    >;
  }
>()("t3/project/ThreadProjectMove") {}

const make = Effect.gen(function* () {
  const threads = yield* ThreadManagement.ThreadManagementService;
  const projects = yield* ProjectService.ProjectService;
  const schedules = yield* ScheduledTasks.ScheduledTaskService;
  const fileSystem = yield* FileSystem.FileSystem;
  const scope = yield* Effect.scope;
  const failure = (reason: string) => (cause: unknown) =>
    new ThreadProjectMoveError({ reason, cause });

  const ensureNoBoundTasks = Effect.fn("ThreadProjectMove.ensureNoBoundTasks")(function* (
    threadId: ThreadId,
  ) {
    const { tasks } = yield* schedules
      .list()
      .pipe(Effect.mapError(failure("Could not check scheduled tasks.")));
    if (tasks.some((task) => task.threadId === threadId)) {
      return yield* new ThreadProjectMoveError({
        reason: "This thread has scheduled tasks. Move or remove them before filing it.",
      });
    }
  });

  const ensureDestination = Effect.fn("ThreadProjectMove.ensureDestination")(function* (
    projectId: ProjectId,
    instanceId: ProviderInstanceId,
  ) {
    const target = yield* projects
      .getById(projectId)
      .pipe(Effect.mapError(failure("Could not read the project.")));
    if (Option.isNone(target) || target.value.deletedAt !== null) {
      return yield* new ThreadProjectMoveError({ reason: "Project not found." });
    }
    const folder = yield* fileSystem
      .stat(target.value.workspaceRoot)
      .pipe(Effect.mapError(failure("The destination project folder is unavailable.")));
    if (folder.type !== "Directory")
      return yield* new ThreadProjectMoveError({
        reason: "The destination project folder is not a directory.",
      });
    if (!(yield* threads.isProviderInstanceEnabledForProject({ projectId, instanceId }))) {
      return yield* new ThreadProjectMoveError({
        reason: "The thread's provider is disabled in the destination project.",
      });
    }
  });

  const move: ThreadProjectMove["Service"]["move"] = Effect.fn("ThreadProjectMove.move")(
    function* (input) {
      const thread = yield* threads
        .getThreadShell(input.threadId)
        .pipe(Effect.mapError(failure("Could not read the thread.")));
      if (thread === null || thread.deletedAt !== null)
        return yield* new ThreadProjectMoveError({ reason: "Thread not found." });
      if (thread.lineage.relationshipToParent !== null)
        return yield* new ThreadProjectMoveError({
          reason: "This thread is related to another thread and cannot move projects.",
        });
      if ((thread.pullRequests?.length ?? 0) > 0 || thread.linkedPullRequest != null)
        return yield* new ThreadProjectMoveError({
          reason: "This thread has linked pull requests. Unlink them before moving.",
        });
      if ((thread.pendingBackgroundTasks?.length ?? 0) > 0)
        return yield* new ThreadProjectMoveError({
          reason: "This thread has background work in progress. Finish or stop it first.",
        });
      const family = yield* Effect.flatten(threads.readShellSnapshot({ familyOf: thread.id })).pipe(
        Effect.mapError(failure("Could not check related threads.")),
      );
      if (
        [...family.threads, ...family.archivedThreads].some(
          (member) => member.id !== thread.id && member.lineage.relationshipToParent === "fork",
        )
      )
        return yield* new ThreadProjectMoveError({
          reason: "This thread has related forks and cannot move projects.",
        });
      const { subagents } = yield* threads
        .getThreadRecords(thread.id, ["subagents"], { turnItemTypes: [] })
        .pipe(Effect.mapError(failure("Could not check background work.")));
      if (
        subagents.some(
          (item) =>
            ["pending", "running", "waiting"].includes(item.status) ||
            item.completionDelivery?.state === "pending" ||
            item.completionDelivery?.state === "claimed",
        )
      )
        return yield* new ThreadProjectMoveError({
          reason: "This thread has background work in progress. Finish or stop it first.",
        });
      yield* ensureDestination(input.projectId, thread.providerInstanceId);
      yield* ensureNoBoundTasks(input.threadId);
      const alreadyFiled = thread.projectId === input.projectId;
      if (alreadyFiled && !input.settleAfterMove)
        return yield* new ThreadProjectMoveError({
          reason: "This thread is already in that project.",
        });
      const apply = Effect.gen(function* () {
        yield* ensureDestination(input.projectId, thread.providerInstanceId);
        yield* ensureNoBoundTasks(input.threadId);
        // A retry after "moved but could not be settled" lands here and only settles.
        const moved = alreadyFiled
          ? null
          : yield* threads
              .dispatch({
                type: "thread.project.move",
                commandId: input.commandId,
                threadId: input.threadId,
                projectId: input.projectId,
                expectedProjectId: thread.projectId,
              })
              .pipe(
                Effect.mapError((cause) =>
                  cause._tag === "OrchestratorDispatchError" && typeof cause.cause === "string"
                    ? new ThreadProjectMoveError({ reason: cause.cause, cause })
                    : failure("Could not move the thread.")(cause),
                ),
              );
        const settled = input.settleAfterMove
          ? yield* threads
              .settleThread({
                threadId: input.threadId,
                commandId: CommandId.make(`${input.commandId}:settle`),
                byOwnAgent: false,
              })
              .pipe(
                Effect.mapError(
                  failure(
                    moved === null
                      ? "Could not settle the thread."
                      : "The thread moved but could not be settled.",
                  ),
                ),
              )
          : null;
        if (moved !== null) return { sequence: moved.sequence };
        if (settled !== null && "sequence" in settled) return { sequence: settled.sequence };
        return yield* new ThreadProjectMoveError({ reason: "Could not settle the thread." });
      });
      if (input.byOwnAgent && thread.activeRunId !== null) {
        yield* threads
          .waitForThread({
            projectId: thread.projectId,
            threadId: thread.id,
            runId: thread.activeRunId,
            timeoutMs: 24 * 60 * 60 * 1_000,
          })
          .pipe(
            Effect.flatMap(({ run }) =>
              run?.status === "completed"
                ? apply
                : Effect.logWarning("Deferred thread move skipped: the turn did not complete.", {
                    threadId: thread.id,
                    runStatus: run?.status ?? null,
                  }),
            ),
            Effect.ignoreCause({ log: true }),
            Effect.forkIn(scope),
          );
        return { movesWhenTurnEnds: true } as const;
      }
      return yield* apply;
    },
  );
  return ThreadProjectMove.of({ move });
});

export const layer = Layer.effect(ThreadProjectMove, make);
