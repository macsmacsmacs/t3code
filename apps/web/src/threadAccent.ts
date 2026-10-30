import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

// Mid lightness and chroma keep each hue legible on both the light and dark canvases.
export const THREAD_ACCENTS = [
  { id: "red", label: "Red", color: "oklch(0.62 0.16 25)" },
  { id: "orange", label: "Orange", color: "oklch(0.64 0.16 50)" },
  { id: "amber", label: "Amber", color: "oklch(0.7 0.14 80)" },
  { id: "green", label: "Green", color: "oklch(0.62 0.14 150)" },
  { id: "teal", label: "Teal", color: "oklch(0.62 0.11 195)" },
  { id: "blue", label: "Blue", color: "oklch(0.62 0.15 255)" },
  { id: "violet", label: "Violet", color: "oklch(0.62 0.16 295)" },
  { id: "pink", label: "Pink", color: "oklch(0.64 0.16 350)" },
] as const;

export type ThreadAccentId = (typeof THREAD_ACCENTS)[number]["id"];
export type ThreadAccent = (typeof THREAD_ACCENTS)[number];

export const THREAD_ACCENT_STORAGE_KEY = "t3code:thread-accents:v1";

const accentById = new Map<string, ThreadAccent>(
  THREAD_ACCENTS.map((accent) => [accent.id, accent]),
);

function isThreadAccentId(value: unknown): value is ThreadAccentId {
  return typeof value === "string" && accentById.has(value);
}

interface ThreadAccentStoreState {
  /** Keyed by `scopedThreadKey`. A thread with no accent has no entry. */
  accents: Record<string, ThreadAccentId>;
  setAccent: (threadRef: ScopedThreadRef, accentId: ThreadAccentId | null) => void;
}

function sanitizeAccents(value: unknown): Record<string, ThreadAccentId> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(Object.entries(value).filter(([, id]) => isThreadAccentId(id)));
}

// Saved on this device only: the server has no field for it, so it does not follow a thread
// to another browser or environment.
export const useThreadAccentStore = create<ThreadAccentStoreState>()(
  persist(
    (set) => ({
      accents: {},
      setAccent: (threadRef, accentId) =>
        set((state) => {
          const key = scopedThreadKey(threadRef);
          if (state.accents[key] === (accentId ?? undefined)) return state;
          const { [key]: _removed, ...rest } = state.accents;
          return { accents: accentId === null ? rest : { ...rest, [key]: accentId } };
        }),
    }),
    {
      name: THREAD_ACCENT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ accents }) => ({ accents }),
      merge: (persisted, current) => ({
        ...current,
        accents: sanitizeAccents((persisted as { accents?: unknown } | null)?.accents),
      }),
    },
  ),
);

export function getThreadAccent(threadRef: ScopedThreadRef): ThreadAccent | null {
  const id = useThreadAccentStore.getState().accents[scopedThreadKey(threadRef)];
  return id === undefined ? null : (accentById.get(id) ?? null);
}

export function setThreadAccent(threadRef: ScopedThreadRef, accentId: ThreadAccentId): void {
  useThreadAccentStore.getState().setAccent(threadRef, accentId);
}

export function clearThreadAccent(threadRef: ScopedThreadRef): void {
  useThreadAccentStore.getState().setAccent(threadRef, null);
}

/** Re-renders only when this thread's own accent changes. */
export function useThreadAccent(threadRef: ScopedThreadRef | null): ThreadAccent | null {
  const id = useThreadAccentStore((state) =>
    threadRef === null ? undefined : state.accents[scopedThreadKey(threadRef)],
  );
  return id === undefined ? null : (accentById.get(id) ?? null);
}

/** Applies an `accent:<id>` or `accent:none` menu id. Returns false for any other id. */
export function applyThreadAccentMenuId(threadRef: ScopedThreadRef, menuId: string): boolean {
  if (!menuId.startsWith("accent:")) return false;
  const value = menuId.slice("accent:".length);
  if (value === "none") clearThreadAccent(threadRef);
  else if (isThreadAccentId(value)) setThreadAccent(threadRef, value);
  return true;
}
