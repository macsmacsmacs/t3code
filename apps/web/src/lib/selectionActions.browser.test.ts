import { describe, expect, it, vi } from "vite-plus/test";

import { fakeTimers } from "../../test/render";
import { observeSelectionActions, SELECTION_MULTI_CLICK_INTERVAL_MS } from "./selectionActions";

function click(element: HTMLElement, detail: number) {
  element.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, isPrimary: true, button: 0, detail }),
  );
  window.dispatchEvent(new MouseEvent("mouseup", { button: 0, detail, clientX: 10, clientY: 20 }));
}

describe("observeSelectionActions", () => {
  // A third click can still grow a double-click's word to its paragraph, but nothing extends
  // a triple-click's selection, so only the double-click waits out the multi-click interval.
  it("shows actions on the next frame after a triple-click, not after the multi-click wait", () => {
    using stack = new DisposableStack();
    const element = stack.adopt(document.body.appendChild(document.createElement("p")), (node) =>
      node.remove(),
    );
    stack.use(fakeTimers());
    const onSelection = vi.fn();
    const actions = observeSelectionActions({ element, onSelection, onDismiss: () => {} });
    stack.defer(() => actions.dispose());

    click(element, 1);
    click(element, 2);
    vi.advanceTimersToNextFrame();
    expect(onSelection, "a double-click waits for a possible third click").not.toHaveBeenCalled();

    click(element, 3);
    vi.advanceTimersToNextFrame();
    expect(onSelection, "a triple-click shows actions on the next frame").toHaveBeenCalledWith({
      x: 10,
      y: 20,
    });

    onSelection.mockClear();
    click(element, 1);
    click(element, 2);
    vi.advanceTimersByTime(SELECTION_MULTI_CLICK_INTERVAL_MS);
    vi.advanceTimersToNextFrame();
    expect(onSelection).toHaveBeenCalledOnce();
  });
});
