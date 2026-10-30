import type { ScopedThreadRef } from "@t3tools/contracts";
import { CircleSlashIcon, SwatchBookIcon } from "lucide-react";

import {
  THREAD_ACCENTS,
  clearThreadAccent,
  getThreadAccent,
  setThreadAccent,
} from "../threadAccent";
import {
  ADDON_ICON_CLASS,
  ITEM_ICON_CLASS,
  type CommandPaletteSubmenuItem,
} from "./CommandPalette.logic";
import { ThreadAccentSwatch } from "./ThreadAccentDot";

export function buildThreadAccentItem(threadRef: ScopedThreadRef): CommandPaletteSubmenuItem {
  const current = getThreadAccent(threadRef);
  const currentLabel = <span className="text-xs text-muted-foreground/70">Current</span>;
  return {
    kind: "submenu",
    value: "action:thread-accent",
    searchTerms: ["accent", "color", "colour", "label", "tag", "thread color"],
    title: "Set thread accent color",
    icon: <SwatchBookIcon className={ITEM_ICON_CLASS} />,
    addonIcon: <SwatchBookIcon className={ADDON_ICON_CLASS} />,
    groups: [
      {
        value: "thread-accent",
        label: "Set thread accent color",
        items: [
          ...THREAD_ACCENTS.map((accent) => ({
            kind: "action" as const,
            value: `thread-accent:${accent.id}`,
            title: accent.label,
            searchTerms: [accent.label, "accent", "color"],
            icon: (
              <span className="flex size-4 items-center justify-center">
                <ThreadAccentSwatch accent={accent} className="size-2.5" />
              </span>
            ),
            titleTrailingContent: current?.id === accent.id ? currentLabel : undefined,
            run: async () => {
              setThreadAccent(threadRef, accent.id);
            },
          })),
          {
            kind: "action" as const,
            value: "thread-accent:none",
            title: "None",
            description: "Clear accent color",
            searchTerms: ["none", "clear", "remove", "reset", "accent", "color"],
            icon: <CircleSlashIcon className={ITEM_ICON_CLASS} />,
            titleTrailingContent: current === null ? currentLabel : undefined,
            run: async () => {
              clearThreadAccent(threadRef);
            },
          },
        ],
      },
    ],
  };
}
