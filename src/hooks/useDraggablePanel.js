"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const INTERACTIVE_SELECTOR = "button,a,input,textarea,select,[role='button'],[data-no-drag='true']";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default function useDraggablePanel(stageRef, { disabled = false, margin = 16, topClearance = margin } = {}) {
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  const constrainPosition = useCallback((nextPosition) => {
    const stage = stageRef.current;
    const panel = panelRef.current;
    if (!stage || !panel) return nextPosition;

    const stageRect = stage.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const maxX = Math.max(margin, stageRect.width - panelRect.width - margin);
    const maxY = Math.max(margin, stageRect.height - panelRect.height - margin);

    return {
      x: clamp(nextPosition.x, margin, maxX),
      y: clamp(nextPosition.y, topClearance, maxY),
    };
  }, [margin, stageRef, topClearance]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const updateCompact = () => setIsCompact(query.matches);
    updateCompact();
    query.addEventListener("change", updateCompact);
    return () => query.removeEventListener("change", updateCompact);
  }, []);

  useEffect(() => {
    if (disabled || isCompact) return undefined;

    const placePanel = () => {
      const stage = stageRef.current;
      const panel = panelRef.current;
      if (!stage || !panel) return;
      const stageRect = stage.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const fallbackPosition = {
        x: Math.max(margin, stageRect.width - panelRect.width - 28),
        y: topClearance,
      };
      setPosition((current) => constrainPosition(current ?? fallbackPosition));
    };

    placePanel();
    window.addEventListener("resize", placePanel);
    return () => window.removeEventListener("resize", placePanel);
  }, [constrainPosition, disabled, isCompact, margin, stageRef, topClearance]);

  const handlePointerDown = useCallback((event) => {
    if (disabled || isCompact || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) return;

    const panel = panelRef.current;
    const stage = stageRef.current;
    if (!panel || !stage) return;

    const stageRect = stage.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const currentPosition = position ?? {
      x: panelRect.left - stageRect.left,
      y: panelRect.top - stageRect.top,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: currentPosition.x,
      originY: currentPosition.y,
    };
    setIsDragging(true);
  }, [disabled, isCompact, position, stageRef]);

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    setPosition(constrainPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }));
  }, [constrainPosition]);

  const handlePointerUp = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const style = !disabled && !isCompact && position
    ? { transform: `translate3d(${position.x}px, ${position.y}px, 0)` }
    : undefined;

  return {
    panelRef,
    isCompact,
    isDragging,
    panelStyle: style,
    dragHandleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
  };
}

