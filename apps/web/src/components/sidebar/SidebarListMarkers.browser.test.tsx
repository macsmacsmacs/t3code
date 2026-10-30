import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { describe, expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { sidebarMarkerId } from "../Sidebar.logic";
import { SidebarSectionPlaceholder } from "./SidebarListMarkers";

const ROW_IDS = Array.from({ length: 40 }, (_, index) => `thread-${index}`);

function Row(props: { id: string }) {
  const { setNodeRef, listeners } = useSortable({ id: props.id });
  return (
    <li ref={setNodeRef} data-testid={props.id} className="h-9 list-none" {...listeners}>
      {props.id}
    </li>
  );
}

function SortableList() {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));
  return (
    <div data-testid="scroller" style={{ height: 300, overflowY: "auto" }}>
      <DndContext sensors={sensors} autoScroll={false}>
        <SortableContext
          items={[...ROW_IDS, sidebarMarkerId("settled-placeholder")]}
          strategy={verticalListSortingStrategy}
        >
          <ul>
            {ROW_IDS.map((id) => (
              <Row key={id} id={id} />
            ))}
            <SidebarSectionPlaceholder
              marker="settled-placeholder"
              label="Drop to settle"
              showHint
              isDropTarget={false}
            />
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function pointer(type: string, target: Element, deltaY: number) {
  const rect = target.getBoundingClientRect();
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    button: 0,
    buttons: 1,
    clientX: rect.left + 10,
    clientY: rect.top + rect.height / 2 + deltaY,
  });
}

describe("SidebarSectionPlaceholder", () => {
  it("does not scroll the list to an off-screen settled drop hint when a drag starts", async () => {
    await using screen = await render(<SortableList />);
    const scroller = screen.getByTestId("scroller").element();
    const row = screen.getByTestId("thread-1").element();

    row.dispatchEvent(pointer("pointerdown", row, 0));
    document.dispatchEvent(pointer("pointermove", row, -6));
    const hint = screen.getByTestId("sidebar-settled-placeholder").element();
    await vi.waitFor(() => expect(hint.getAttribute("style")).toContain("translate"));

    expect(scroller.scrollTop, "drag start scrolled the list to the settled drop hint").toBe(0);
    document.dispatchEvent(pointer("pointerup", row, -6));
  });
});
