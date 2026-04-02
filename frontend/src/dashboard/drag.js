import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export const HeaderLockCtx = createContext(0);
export const DragBoundsCtx = createContext({ width: 0, height: 0 });
export const WidgetRegistryCtx = createContext(null);

const SNAP_GRID = 20;
const SNAP_EDGE_THRESHOLD = 18;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function getBoundsMetrics(bounds, el, minY) {
    const fallbackWidth = typeof window !== "undefined" ? window.innerWidth : 0;
    const fallbackHeight = typeof window !== "undefined" ? window.innerHeight : minY;
    const width = bounds?.width || fallbackWidth;
    const height = bounds?.height || fallbackHeight;
    const w = el?.offsetWidth || 0;
    const h = el?.offsetHeight || 0;
    return {
        minX: 0,
        minY,
        maxX: Math.max(0, width - w),
        maxY: Math.max(minY, height - h),
        width: w,
        height: h,
    };
}

function clampToBounds(rawX, rawY, el, minY, bounds) {
    const metrics = getBoundsMetrics(bounds, el, minY);
    return {
        x: clamp(rawX, metrics.minX, metrics.maxX),
        y: clamp(rawY, metrics.minY, metrics.maxY),
        metrics,
    };
}

function overlapsAt(x, y, w, h, thisId, registry) {
    if (!registry?.current) return false;
    for (const [id, entry] of registry.current.entries()) {
        if (id === thisId || !entry.el) continue;
        const ox = entry.x;
        const oy = entry.y;
        const ow = entry.el.offsetWidth;
        const oh = entry.el.offsetHeight;
        if (x < ox + ow && x + w > ox && y < oy + oh && y + h > oy) return true;
    }
    return false;
}

function findOpenSlot(preferredX, preferredY, thisId, registry, metrics) {
    if (!registry?.current || !metrics.width || !metrics.height) return { x: preferredX, y: preferredY };
    if (!overlapsAt(preferredX, preferredY, metrics.width, metrics.height, thisId, registry)) return { x: preferredX, y: preferredY };

    const seen = new Set();
    const tryCandidate = (x, y) => {
        const clampedX = clamp(x, metrics.minX, metrics.maxX);
        const clampedY = clamp(y, metrics.minY, metrics.maxY);
        const key = `${clampedX}:${clampedY}`;
        if (seen.has(key)) return null;
        seen.add(key);
        if (!overlapsAt(clampedX, clampedY, metrics.width, metrics.height, thisId, registry)) {
            return { x: clampedX, y: clampedY };
        }
        return null;
    };

    const maxRadius = Math.max(
        Math.abs(preferredX - metrics.minX),
        Math.abs(metrics.maxX - preferredX),
        Math.abs(preferredY - metrics.minY),
        Math.abs(metrics.maxY - preferredY),
    );

    for (let radius = SNAP_GRID; radius <= maxRadius + SNAP_GRID; radius += SNAP_GRID) {
        for (let dx = -radius; dx <= radius; dx += SNAP_GRID) {
            const topCandidate = tryCandidate(preferredX + dx, preferredY - radius);
            if (topCandidate) return topCandidate;
            const bottomCandidate = tryCandidate(preferredX + dx, preferredY + radius);
            if (bottomCandidate) return bottomCandidate;
        }

        for (let dy = -radius + SNAP_GRID; dy <= radius - SNAP_GRID; dy += SNAP_GRID) {
            const leftCandidate = tryCandidate(preferredX - radius, preferredY + dy);
            if (leftCandidate) return leftCandidate;
            const rightCandidate = tryCandidate(preferredX + radius, preferredY + dy);
            if (rightCandidate) return rightCandidate;
        }
    }

    return { x: preferredX, y: preferredY };
}

function getSafePosition(rawX, rawY, thisId, registry, dragRef, minY, bounds, snapToGrid = true) {
    const el = dragRef?.current;
    const { x: clampedX, y: clampedY, metrics } = clampToBounds(rawX, rawY, el, minY, bounds);
    let x = snapToGrid ? Math.round(clampedX / SNAP_GRID) * SNAP_GRID : clampedX;
    let y = snapToGrid ? Math.round(clampedY / SNAP_GRID) * SNAP_GRID : clampedY;

    x = clamp(x, metrics.minX, metrics.maxX);
    y = clamp(y, metrics.minY, metrics.maxY);

    if (!el || !registry?.current) return { x, y };

    let bestXSnap = null;
    let bestYSnap = null;
    let bestXDist = SNAP_EDGE_THRESHOLD;
    let bestYDist = SNAP_EDGE_THRESHOLD;

    registry.current.forEach((entry, id) => {
        if (id === thisId || !entry.el) return;
        const ox = entry.x;
        const oy = entry.y;
        const ow = entry.el.offsetWidth;
        const oh = entry.el.offsetHeight;
        const d1x = Math.abs(x - (ox + ow));
        const d2x = Math.abs((x + metrics.width) - ox);
        if (d1x < bestXDist) { bestXDist = d1x; bestXSnap = ox + ow; }
        if (d2x < bestXDist) { bestXDist = d2x; bestXSnap = ox - metrics.width; }
        const d1y = Math.abs(y - (oy + oh));
        const d2y = Math.abs((y + metrics.height) - oy);
        if (d1y < bestYDist) { bestYDist = d1y; bestYSnap = oy + oh; }
        if (d2y < bestYDist) { bestYDist = d2y; bestYSnap = oy - metrics.height; }
    });

    if (snapToGrid) {
        if (bestXSnap !== null) x = clamp(bestXSnap, metrics.minX, metrics.maxX);
        if (bestYSnap !== null) y = clamp(bestYSnap, metrics.minY, metrics.maxY);
    }

    return findOpenSlot(x, y, thisId, registry, metrics);
}

export function useDraggable(ix, iy) {
    const minY = useContext(HeaderLockCtx);
    const bounds = useContext(DragBoundsCtx);
    const registry = useContext(WidgetRegistryCtx);
    const minYRef = useRef(minY);
    const boundsRef = useRef(bounds);
    const dragRef = useRef(null);
    const idRef = useRef(`w_${Math.random().toString(36).slice(2)}`);
    useEffect(() => { minYRef.current = minY; }, [minY]);
    useEffect(() => { boundsRef.current = bounds; }, [bounds]);
    const [pos, setPos] = useState({ x: ix, y: Math.max(minY, iy) });
    const dr = useRef(false);
    const off = useRef({ x: 0, y: 0 });
    const moveHandlerRef = useRef(null);
    const upHandlerRef = useRef(null);

    useEffect(() => () => {
        dr.current = false;
        if (moveHandlerRef.current) window.removeEventListener("mousemove", moveHandlerRef.current);
        if (upHandlerRef.current) window.removeEventListener("mouseup", upHandlerRef.current);
    }, []);

    useEffect(() => {
        if (!registry) return;
        registry.current.set(idRef.current, { x: pos.x, y: pos.y, el: dragRef.current });
        return () => {
            registry.current.delete(idRef.current);
        };
    }, [registry]);

    useEffect(() => {
        if (!registry) return;
        const entry = registry.current.get(idRef.current);
        if (entry) {
            entry.x = pos.x;
            entry.y = pos.y;
            entry.el = dragRef.current;
        }
    }, [pos, registry]);

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            const safePos = getSafePosition(pos.x, pos.y, idRef.current, registry, dragRef, minYRef.current, boundsRef.current, false);
            setPos(cur => cur.x === safePos.x && cur.y === safePos.y ? cur : safePos);
        });
        return () => window.cancelAnimationFrame(frame);
    // pos is intentionally excluded: we only need to re-clamp when the
    // viewport or header lock changes, and this effect captures the
    // current position from that render before scheduling the rAF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [minY, registry, bounds?.width, bounds?.height]);

    const onMouseDown = useCallback((e) => {
        if (e.target.closest("button, input, textarea, select, a, [data-nodrag]")) return;
        e.preventDefault();
        dr.current = true;
        off.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        const mv = (ev) => {
            if (!dr.current) return;
            const rawX = ev.clientX - off.current.x;
            const rawY = ev.clientY - off.current.y;
            setPos(getSafePosition(rawX, rawY, idRef.current, registry, dragRef, minYRef.current, boundsRef.current, !ev.altKey));
        };
        const up = () => {
            dr.current = false;
            window.removeEventListener("mousemove", mv);
            window.removeEventListener("mouseup", up);
            moveHandlerRef.current = null;
            upHandlerRef.current = null;
        };
        moveHandlerRef.current = mv;
        upHandlerRef.current = up;
        window.addEventListener("mousemove", mv);
        window.addEventListener("mouseup", up);
    }, [pos.x, pos.y, registry]);

    return { pos, onMouseDown, dragRef };
}
