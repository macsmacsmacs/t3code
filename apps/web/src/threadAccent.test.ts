import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  applyThreadAccentMenuId,
  clearThreadAccent,
  getThreadAccent,
  setThreadAccent,
  THREAD_ACCENT_STORAGE_KEY,
  useThreadAccentStore,
} from "./threadAccent";

const refA = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-A"));
const refB = scopeThreadRef("env-2" as EnvironmentId, ThreadId.make("thread-A"));

beforeEach(() => {
  useThreadAccentStore.setState({ accents: {} });
});

describe("threadAccent", () => {
  it("keys accents by environment and thread, and removes the entry when cleared", async () => {
    setThreadAccent(refA, "teal");
    setThreadAccent(refB, "pink");
    expect(getThreadAccent(refA)?.id).toBe("teal");
    expect(getThreadAccent(refB)?.id).toBe("pink");

    const { storage } = useThreadAccentStore.persist.getOptions();
    const saved = await storage!.getItem(THREAD_ACCENT_STORAGE_KEY);
    expect(saved).toMatchObject({
      state: { accents: { "env-1:thread-A": "teal", "env-2:thread-A": "pink" } },
      version: 1,
    });

    clearThreadAccent(refA);
    expect(getThreadAccent(refA)).toBeNull();
    expect(Object.keys(useThreadAccentStore.getState().accents)).toEqual(["env-2:thread-A"]);
  });

  it("drops unknown colors when reading saved state", async () => {
    const { storage } = useThreadAccentStore.persist.getOptions();
    await storage!.setItem(THREAD_ACCENT_STORAGE_KEY, {
      state: { accents: { "env-1:thread-A": "violet", "env-1:thread-B": "chartreuse" } },
      version: 1,
    });
    await useThreadAccentStore.persist.rehydrate();
    expect(useThreadAccentStore.getState().accents).toEqual({ "env-1:thread-A": "violet" });
  });

  it("applies accent menu ids and ignores others", () => {
    expect(applyThreadAccentMenuId(refA, "accent:blue")).toBe(true);
    expect(getThreadAccent(refA)?.id).toBe("blue");
    expect(applyThreadAccentMenuId(refA, "accent:none")).toBe(true);
    expect(getThreadAccent(refA)).toBeNull();
    expect(applyThreadAccentMenuId(refA, "pin")).toBe(false);
  });
});
