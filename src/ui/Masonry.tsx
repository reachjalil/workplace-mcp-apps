import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { recommendedOrder, type WidgetId } from "../shared/config";
import type { Snapshot } from "../shared/data";
import { Widget } from "./Widgets";

export const masonryRowHeight = 8;
export const masonryGap = 20;
export const estimatedWidgetHeights: Record<WidgetId, number> = {
  agenda: 680, brief: 230, attention: 500, goals: 230,
  leave: 190, learning: 250, updates: 340, actions: 260,
};

export function MasonryItem({ widget, children }: { widget: WidgetId; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(() => Math.ceil((estimatedWidgetHeights[widget] + masonryGap) / masonryRowHeight));
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    let frame = 0;
    const measure = () => {
      const height = node.getBoundingClientRect().height;
      if (height > 0) {
        const next = Math.ceil((height + masonryGap) / masonryRowHeight);
        setRows(current => current === next ? current : next);
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(node);
    window.addEventListener("resize", schedule);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [widget]);
  return <div className="masonry-item" role="listitem" data-masonry-widget={widget} style={{ gridRowEnd: `span ${rows}` }}><div ref={content} className="masonry-content">{children}</div></div>;
}

export function WorkplaceBoard({ snapshots }: { snapshots: Record<WidgetId, Snapshot> }) {
  return <div className="masonry-grid" role="list" aria-label="Workplace widgets" data-row-height={masonryRowHeight}>{recommendedOrder.map(widget => <MasonryItem key={widget} widget={widget}><Widget snapshot={snapshots[widget]} /></MasonryItem>)}</div>;
}
