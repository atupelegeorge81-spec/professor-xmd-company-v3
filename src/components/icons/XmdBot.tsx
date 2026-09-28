"use client";

import { useEffect, useId, useRef } from "react";

type Props = {
  size?: number;
  active?: boolean;
  className?: string;
  strokeWidth?: number;
  live?: boolean;
};

type Key = "gx" | "gy" | "w" | "h" | "joy";

const REST: Record<Key, number> = {
  gx: 0.35,
  gy: 0.3,
  w: 2.5,
  h: 5.2,
  joy: 0,
};

const K = 190;
const C = 2 * Math.sqrt(K) * 0.72;

const R_EYES = 8.3;
const THETA = 0.36;
const PHI0 = 0.1;

export function XmdBot({
  size = 22,
  active = false,
  className = "",
}: Props) {
  const uid = useId().replace(/:/g, "");
  const MASK = `xb-m-${uid}`;
  const GRAD = `xb-g-${uid}`;

  const root = useRef<SVGSVGElement>(null);
  const eyeL = useRef<SVGRectElement>(null);
  const eyeR = useRef<SVGRectElement>(null);
  const joyL = useRef<SVGPathElement>(null);
  const joyR = useRef<SVGPathElement>(null);

  const api = useRef<{
    set: (t: Partial<Record<Key, number>>) => void;
    pulse: (t: Partial<Record<Key, number>>, ms: number) => void;
  } | null>(null);

  const wasActive = useRef(active);

  useEffect(() => {
    const pos: Record<Key, number> = { ...REST };
    const vel: Record<Key, number> = {
      gx: 0,
      gy: 0,
      w: 0,
      h: 0,
      joy: 0,
    };
    const tgt: Record<Key, number> = { ...REST };

    const keys = Object.keys(REST) as Key[];

    let raf = 0;
    let last = 0;
    let alive = true;

    const timers: number[] = [];

    const later = (fn: () => void, ms: number) =>
      timers.push(window.setTimeout(fn, ms));

    const draw = () => {
      const yaw = pos.gx * 0.75;
      const pitch = pos.gy * 0.5;
      const joy = Math.max(0, Math.min(1, pos.joy));

      [
        [eyeL.current, joyL.current, -1],
        [eyeR.current, joyR.current, 1],
      ].forEach(([eye, arc, side]) => {
        const a = (side as number) * THETA + yaw;
        const b = PHI0 + pitch;

        const x =
          12 + R_EYES * Math.sin(a) * Math.cos(b);

        const y =
          12 -
          R_EYES * Math.sin(b) +
          (side as number) * yaw * -0.35;

        const fx = Math.max(0.22, Math.cos(a));
        const fy = Math.max(0.45, Math.cos(b));

        const w = Math.max(0.3, pos.w * fx);
        const h = Math.max(0.35, pos.h * fy);

        const rot =
          -pos.gx * 22 + (side as number) * 2;

        const e = eye as SVGRectElement | null;

        if (e) {
          e.setAttribute("x", String(x - w / 2));
          e.setAttribute("y", String(y - h / 2));
          e.setAttribute("width", String(w));
          e.setAttribute("height", String(h));
          e.setAttribute(
            "rx",
            String(Math.min(w, h) / 2),
          );
          e.setAttribute(
            "transform",
            `rotate(${rot} ${x} ${y})`,
          );
          e.setAttribute(
            "opacity",
            String(1 - joy),
          );
        }

        const p = arc as SVGPathElement | null;

        if (p) {
          const hw = 1.25 * fx + 0.25;

          p.setAttribute(
            "d",
            `M${x - hw} ${y + 0.9} Q${x} ${y - 1.9} ${
              x + hw
            } ${y + 0.9}`,
          );

          p.setAttribute("opacity", String(joy));
        }
      });
    };

    const step = (t: number) => {
      const dt = Math.min(
        0.033,
        last ? (t - last) / 1000 : 0.016,
      );

      last = t;

      let moving = false;

      for (const k of keys) {
        const a =
          K * (tgt[k] - pos[k]) - C * vel[k];

        vel[k] += a * dt;
        pos[k] += vel[k] * dt;

        if (
          Math.abs(vel[k]) > 0.002 ||
          Math.abs(tgt[k] - pos[k]) > 0.002
        ) {
          moving = true;
        }
      }

      draw();

      if (moving && alive) {
        raf = requestAnimationFrame(step);
      } else {
        raf = 0;
        last = 0;
      }
    };

    const kick = () => {
      if (!raf && alive) {
        raf = requestAnimationFrame(step);
      }
    };

    const set = (
      t: Partial<Record<Key, number>>,
    ) => {
      Object.assign(tgt, t);
      kick();
    };

    const pulse = (
      t: Partial<Record<Key, number>>,
      ms: number,
    ) => {
      const back: Partial<Record<Key, number>> = {};

      (Object.keys(t) as Key[]).forEach(
        (k) => (back[k] = REST[k]),
      );

      set(t);
      later(() => set(back), ms);
    };

    api.current = { set, pulse };

    draw();

    if (
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches
    ) {
      return () => {
        alive = false;
      };
    }

    let lastPointer = 0;

    const wander = () => {
      if (!alive) return;

      if (Date.now() - lastPointer > 2600) {
        const r = Math.random();

        if (r < 0.35) {
          set({
            gx: REST.gx,
            gy: REST.gy,
          });
        } else {
          set({
            gx: Math.random() * 2 - 1,
            gy: Math.random() * 1.4 - 0.6,
          });
        }

        if (Math.random() < 0.14) {
          pulse(
            {
              w: 3.9,
              h: 4.4,
            },
            1100,
          );
        }
      }

      later(
        wander,
        1500 + Math.random() * 2300,
      );
    };

    const blink = () => {
      if (!alive) return;

      pulse({ h: 0.4 }, 95);

      if (Math.random() < 0.22) {
        later(
          () => pulse({ h: 0.4 }, 95),
          260,
        );
      }

      later(
        blink,
        2600 + Math.random() * 3600,
      );
    };

    let praf = 0;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;

      cancelAnimationFrame(praf);

      praf = requestAnimationFrame(() => {
        const el = root.current;
        if (!el) return;

        const b = el.getBoundingClientRect();
        if (!b.width) return;

        const dx =
          e.clientX -
          (b.left + b.width / 2);

        const dy =
          e.clientY -
          (b.top + b.height / 2);

        if (Math.hypot(dx, dy) > 700) return;

        lastPointer = Date.now();

        set({
          gx: Math.max(
            -1,
            Math.min(1, dx / 240),
          ),
          gy: Math.max(
            -0.8,
            Math.min(0.9, -dy / 240),
          ),
        });
      });
    };

    later(
      wander,
      700 + Math.random() * 900,
    );

    later(
      blink,
      1400 + Math.random() * 1800,
    );

    window.addEventListener(
      "pointermove",
      onMove,
      { passive: true },
    );

    return () => {
      alive = false;

      cancelAnimationFrame(raf);
      cancelAnimationFrame(praf);

      timers.forEach(clearTimeout);

      window.removeEventListener(
        "pointermove",
        onMove,
      );
    };
  }, []);

  useEffect(() => {
    if (
      active &&
      !wasActive.current &&
      api.current
    ) {
      api.current.set({ h: 0.4 });

      window.setTimeout(
        () =>
          api.current?.set({
            h: REST.h,
          }),
        140,
      );

      window.setTimeout(
        () =>
          api.current?.pulse(
            { joy: 1 },
            1100,
          ),
        320,
      );
    }

    wasActive.current = active;
  }, [active]);

  return (
    <svg
      ref={root}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      onPointerEnter={() =>
        api.current?.pulse(
          { joy: 1 },
          900,
        )
      }
    >
      <defs>
        <linearGradient
          id={GRAD}
          x1="3"
          y1="3"
          x2="21"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <stop
            offset="0"
            stopColor="#3d7bff"
          />
          <stop
            offset="0.55"
            stopColor="#8b5cf6"
          />
          <stop
            offset="1"
            stopColor="#d946ef"
          />
        </linearGradient>

        <mask
          id={MASK}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect
            width="24"
            height="24"
            fill="#fff"
          />

          <rect
            ref={eyeL}
            fill="#000"
          />

          <rect
            ref={eyeR}
            fill="#000"
          />

          <path
            ref={joyL}
            fill="none"
            stroke="#000"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0"
          />

          <path
            ref={joyR}
            fill="none"
            stroke="#000"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0"
          />
        </mask>
      </defs>

      <circle
        cx="12"
        cy="12"
        r="10.6"
        fill={
          active
            ? `url(#${GRAD})`
            : "currentColor"
        }
        mask={`url(#${MASK})`}
      />
    </svg>
  );
}
