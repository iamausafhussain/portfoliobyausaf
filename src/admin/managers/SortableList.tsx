/** Drag-and-drop list with full keyboard support (spec 02 AD-11, §3.9). */
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import styles from './list.module.css';

export interface SortableListProps<T extends { id: string }> {
  items: T[];
  disabled?: boolean;
  label: (item: T) => string;
  /** New order of ids, plus the single move that produced it. */
  onReorder: (ids: string[], move: { from: number; to: number }) => void;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
}

function SortableRow({
  id,
  disabled,
  label,
  children,
}: {
  id: string;
  disabled?: boolean;
  label: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
      disabled,
    });
  const handle = disabled ? (
    <span className={styles.handleSpacer} aria-hidden />
  ) : (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className={styles.handle}
      aria-label={`Reorder ${label}. Press Space, then arrow keys, then Space to drop.`}
      {...attributes}
      {...listeners}
    >
      <Icon name="drag" />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      className={styles.row}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children(handle)}
    </li>
  );
}

export function SortableList<T extends { id: string }>({
  items,
  disabled,
  label,
  onReorder,
  renderItem,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((i) => i.id);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to), { from, to });
  };

  const byId = new Map(items.map((i) => [i.id, i]));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${label(byId.get(String(active.id))!)}.`,
          onDragOver: ({ over }) =>
            over ? `Moved to position ${ids.indexOf(String(over.id)) + 1} of ${ids.length}.` : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? `Dropped ${label(byId.get(String(active.id))!)} at position ${ids.indexOf(String(over.id)) + 1}.`
              : 'Cancelled.',
          onDragCancel: () => 'Reorder cancelled.',
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        <ul className={styles.list}>
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id} disabled={disabled} label={label(item)}>
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
