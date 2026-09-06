"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#fb0184", "#ffffff", "#ff6fb5", "#8b8f98", "#ffd166"];
const GRAVITY = 0.28;
const DRAG = 0.995;
const LIFE_MS = 3200;

type Piece = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; color: string };

function burst(w: number, h: number, count: number): Piece[] {
  return Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const speed = 9 + Math.random() * 11;
    return {
      x: w / 2 + (Math.random() - 0.5) * w * 0.35,
      y: h * 0.52,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });
}

// One-shot confetti burst over the whole viewport. Mount it when something succeeded; it cleans itself up and stays
// blank for visitors who asked for reduced motion. With `whenParam` it only fires if the page was opened with
// ?<param>=1, and strips the flag so a refresh does not replay it.
export function Confetti({ count = 140, whenParam }: { count?: number; whenParam?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (whenParam) {
      const url = new URL(window.location.href);
      if (url.searchParams.get(whenParam) !== "1") return;
      url.searchParams.delete(whenParam);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pieces = burst(w, h, count);
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, w, h);
      const fade = Math.max(0, 1 - Math.max(0, elapsed - LIFE_MS * 0.6) / (LIFE_MS * 0.4));
      ctx.globalAlpha = fade;
      for (const p of pieces) {
        p.vx *= DRAG;
        p.vy = p.vy * DRAG + GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot)));
        ctx.restore();
      }
      if (elapsed < LIFE_MS) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [count, whenParam]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-50 h-full w-full" />;
}
