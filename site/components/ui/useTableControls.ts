"use client";

import { useEffect, useState, type RefObject } from "react";

const SPACE = "--table-controls-bottom-space";
const SETTLE_MS = 360; // Fallback check; actual CSS animations must finish first.

/** Resize the table viewport without treating layout changes as another gesture. */
export function useTableControls(shellRef: RefObject<HTMLDivElement>, contextKey: string) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    let closed = false;
    let manual = false;
    let transitioning = false;
    let returnedToTop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: HTMLElement | null = null;
    const positions = new WeakMap<HTMLElement, number>();
    const tables = new Set<HTMLElement>();
    setCollapsed(false);

    const topOf = (table: HTMLElement) => Math.max(0, table.scrollTop);
    const contentHeight = (table: HTMLElement) => {
      const top = table.getBoundingClientRect().top + table.clientTop;
      return Math.ceil(Math.max(0, ...[...table.children].map(child =>
        child.getBoundingClientRect().bottom - top + table.scrollTop)));
    };
    const barHeight = () => [...shell.querySelectorAll<HTMLElement>(".collapsible-bar")]
      .reduce((sum, bar) => sum + bar.getBoundingClientRect().height, 0);
    const setSpace = (table: HTMLElement, space: number) => {
      if (space > 0) table.style.setProperty(SPACE, `${Math.ceil(space)}px`);
      else table.style.removeProperty(SPACE);
    };
    // Padding is needed only when an enlarged viewport would otherwise clamp
    // the current G row at the end of a table. It never adds data rows.
    const trimSpace = (table: HTMLElement) => {
      // Reopened controls restore the smaller viewport, so compensation is no
      // longer needed. Clear it directly: old padding can itself impose a flex
      // minimum height larger than that viewport on a narrow screen.
      if (!closed) { setSpace(table, 0); return; }
      // scrollHeight is clamped to clientHeight for short content, so subtracting
      // the old padding from it would invent empty scroll space on short tables.
      const top = topOf(table);
      setSpace(table, top > 0 ? Math.max(0, top + table.clientHeight - contentHeight(table)) : 0);
    };

    const settle = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (!transitioning) return;
      // React can commit after the timer starts, and a busy mobile frame can
      // start CSS later still. Never release the anchor while height is moving.
      const animating = [...shell.querySelectorAll<HTMLElement>(".collapsible-bar")]
        .some(bar => bar.getAnimations().some(animation => animation.playState === "running" || animation.pending));
      if (animating) {
        timer = setTimeout(settle, 60);
        return;
      }
      transitioning = false;
      if (!active || !shell.contains(active)) return;
      trimSpace(active);
      // A fast swipe may finish before the height transition. Do not discard
      // its final top position; manual collapse at 0G must still remain closed.
      const top = topOf(active);
      if ((!manual || returnedToTop) && top <= 24) {
        manual = false;
        apply(false, active);
      } else if (!manual && !closed && top > 88 &&
          active.scrollHeight - active.clientHeight - top >= barHeight()) {
        apply(true, active);
      }
      returnedToTop = false;
    };

    const apply = (next: boolean, table: HTMLElement) => {
      active = table;
      tables.add(table);
      if (next === closed) return;
      if (next) {
        const top = topOf(table);
        setSpace(table, top > 0 ? Math.max(0, top + table.clientHeight + barHeight() - contentHeight(table)) : 0);
      }
      closed = next;
      transitioning = true;
      returnedToTop = false;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS);
      setCollapsed(next);
    };

    for (const table of shell.querySelectorAll<HTMLElement>("[data-table-scroll]")) {
      table.style.removeProperty(SPACE);
      table.scrollTop = 0;
      positions.set(table, 0);
      tables.add(table);
    }

    const onScroll = (event: Event) => {
      const table = event.target;
      if (!(table instanceof HTMLElement) || !table.matches("[data-table-scroll]")) return;
      const top = topOf(table);
      const previous = positions.get(table) ?? 0;
      positions.set(table, top);
      if (top === previous) return; // Horizontal scrolling is not resizing input.
      active = table;
      tables.add(table);
      if (transitioning) {
        if (top < previous && top <= 24) returnedToTop = true;
        return;
      }
      trimSpace(table);
      if (top <= 24) {
        manual = false;
        apply(false, table);
      } else if (!manual && !closed && top > 88 &&
          table.scrollHeight - table.clientHeight - top >= barHeight()) {
        apply(true, table);
      }
    };

    const headerTable = (target: EventTarget | null) => {
      if (!(target instanceof Element) || !target.closest("thead") ||
          target.closest("button, a, input, select, textarea, [role=button]")) return null;
      const table = target.closest<HTMLElement>("[data-table-scroll]");
      return table && shell.contains(table) ? table : null;
    };
    const decide = (dy: number, table: HTMLElement) => {
      manual = true;
      apply(dy < 0, table);
    };

    type Gesture = { id: number; y: number; table: HTMLElement; fired: boolean };
    let touch: Gesture | null = null;
    let pointer: Gesture | null = null;
    const onTouchStart = (event: TouchEvent) => {
      const table = headerTable(event.target);
      const finger = event.touches.length === 1 ? event.touches[0] : undefined;
      touch = table && finger ? { id: finger.identifier, y: finger.clientY, table, fired: false } : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!touch) return;
      if (event.touches.length !== 1) { touch = null; return; }
      // Keep the entire drag captured, including moves after the threshold.
      if (event.cancelable) event.preventDefault();
      const finger = [...event.touches].find(item => item.identifier === touch!.id);
      if (!finger || touch.fired || Math.abs(finger.clientY - touch.y) < 20) return;
      touch.fired = true;
      decide(finger.clientY - touch.y, touch.table);
    };
    const onTouchEnd = () => { touch = null; };
    const onPointerEnd = () => {
      const id = pointer?.id;
      pointer = null;
      if (id !== undefined && shell.hasPointerCapture(id)) shell.releasePointerCapture(id);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.button !== 0) return;
      const table = headerTable(event.target);
      if (!table) return;
      pointer = { id: event.pointerId, y: event.clientY, table, fired: false };
      shell.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      if (!(event.buttons & 1)) { onPointerEnd(); return; }
      if (pointer.fired || Math.abs(event.clientY - pointer.y) < 20) return;
      pointer.fired = true;
      decide(event.clientY - pointer.y, pointer.table);
    };
    const cancelGestures = () => { onTouchEnd(); onPointerEnd(); };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target instanceof Element && event.target.matches(".collapsible-bar") &&
          (event.propertyName === "grid-template-rows" || event.propertyName.startsWith("border-"))) settle();
    };

    shell.addEventListener("scroll", onScroll, true);
    shell.addEventListener("transitionend", onTransitionEnd);
    shell.addEventListener("touchstart", onTouchStart, { passive: true });
    shell.addEventListener("touchmove", onTouchMove, { passive: false });
    shell.addEventListener("touchend", onTouchEnd);
    shell.addEventListener("touchcancel", onTouchEnd);
    shell.addEventListener("pointerdown", onPointerDown);
    shell.addEventListener("lostpointercapture", onPointerEnd);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    window.addEventListener("blur", cancelGestures);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      cancelGestures();
      for (const table of tables) table.style.removeProperty(SPACE);
      shell.removeEventListener("scroll", onScroll, true);
      shell.removeEventListener("transitionend", onTransitionEnd);
      shell.removeEventListener("touchstart", onTouchStart);
      shell.removeEventListener("touchmove", onTouchMove);
      shell.removeEventListener("touchend", onTouchEnd);
      shell.removeEventListener("touchcancel", onTouchEnd);
      shell.removeEventListener("pointerdown", onPointerDown);
      shell.removeEventListener("lostpointercapture", onPointerEnd);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("blur", cancelGestures);
    };
  }, [shellRef, contextKey]);

  return collapsed;
}
