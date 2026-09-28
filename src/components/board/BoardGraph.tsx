"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Database, Search, Zap } from "lucide-react";
import { AGENTS, getAgent, type AgentId } from "@/lib/team";

type Box = { x: number; y: number; w: number; h: number };

type Layout = {
  w: number;
  h: number;
  ceo: Box;
  chair: Box;
  tools: {
    evidence: { x: number; y: number };
    ledger: { x: number; y: number };
  };
  owners: Record<Exclude<AgentId, "optimus">, Box>;
  edges: {
    ceo: string;
    evidence: string;
    ledger: string;
    owners: Record<Exclude<AgentId, "optimus">, string>;
  };
};

const OWNERS: Exclude<AgentId, "optimus">[] = [
  "ultron",
  "vextron",
  "megatron",
  "cybertron",
];

function route(pts: [number, number][], r = 10): string {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;

  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];

    const d1 = Math.hypot(cx - px, cy - py);
    const d2 = Math.hypot(nx - cx, ny - cy);

    const k = Math.min(r, d1 / 2, d2 / 2);

    const ax = cx - ((cx - px) / d1) * k;
    const ay = cy - ((cy - py) / d1) * k;

    const bx = cx + ((nx - cx) / d2) * k;
    const by = cy + ((ny - cy) / d2) * k;

    d += ` L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  }

  const last = pts[pts.length - 1];

  return `${d} L ${last[0]} ${last[1]}`;
}

const bottom = (b: Box): [number, number] => [
  b.x,
  b.y + b.h / 2,
];

const top = (b: Box): [number, number] => [
  b.x,
  b.y - b.h / 2,
];

function desktop(): Layout {
  const ceo = { x: 350, y: 40, w: 196, h: 52 };

  const chair = {
    x: 350,
    y: 152,
    w: 236,
    h: 64,
  };

  const owners = {
    ultron: { x: 92, y: 306, w: 164, h: 54 },
    vextron: { x: 263, y: 306, w: 164, h: 54 },
    megatron: { x: 437, y: 306, w: 164, h: 54 },
    cybertron: { x: 608, y: 306, w: 164, h: 54 },
  };

  const bus = 236;

  const [sx, sy] = bottom(chair);

  const edges = {
    ceo: route([
      bottom(ceo),
      top(chair),
    ]),

    evidence: route([
      [chair.x - chair.w / 2, chair.y],
      [154, chair.y],
    ]),

    ledger: route([
      [chair.x + chair.w / 2, chair.y],
      [546, chair.y],
    ]),

    owners: Object.fromEntries(
      OWNERS.map((id) => [
        id,
        route(
          [
            [sx, sy],
            [sx, bus],
            [owners[id].x, bus],
            top(owners[id]),
          ],
          12,
        ),
      ]),
    ) as Layout["edges"]["owners"],
  };

  return {
    w: 700,
    h: 348,
    ceo,
    chair,
    tools: {
      evidence: { x: 120, y: 152 },
      ledger: { x: 580, y: 152 },
    },
    owners,
    edges,
  };
}

function mobile(): Layout {
  const ceo = {
    x: 170,
    y: 34,
    w: 188,
    h: 50,
  };

  const chair = {
    x: 170,
    y: 134,
    w: 220,
    h: 62,
  };

  const owners = {
    ultron: { x: 86, y: 318, w: 158, h: 52 },
    vextron: { x: 254, y: 318, w: 158, h: 52 },
    megatron: { x: 86, y: 420, w: 158, h: 52 },
    cybertron: { x: 254, y: 420, w: 158, h: 52 },
  };

  const [sx, sy] = bottom(chair);

  const row1 = 262;
  const row2 = 370;

  const edges = {
    ceo: route([
      bottom(ceo),
      top(chair),
    ]),

    evidence: route([
      [chair.x - 70, sy],
      [chair.x - 70, 212],
      [66, 212],
    ], 10),

    ledger: route([
      [chair.x + 70, sy],
      [chair.x + 70, 212],
      [274, 212],
    ], 10),

    owners: {
      ultron: route([
        [sx, sy],
        [sx, row1],
        [owners.ultron.x, row1],
        top(owners.ultron),
      ], 12),

      vextron: route([
        [sx, sy],
        [sx, row1],
        [owners.vextron.x, row1],
        top(owners.vextron),
      ], 12),

      megatron: route([
        [sx, sy],
        [sx, row2],
        [owners.megatron.x, row2],
        top(owners.megatron),
      ], 12),

      cybertron: route([
        [sx, sy],
        [sx, row2],
        [owners.cybertron.x, row2],
        top(owners.cybertron),
      ], 12),
    },
  };

  return {
    w: 340,
    h: 460,
    ceo,
    chair,
    tools: {
      evidence: { x: 40, y: 212 },
      ledger: { x: 300, y: 212 },
    },
    owners,
    edges,
  };
}

function Handles({
  color,
  active,
  sides = ["top", "bottom"],
}: {
  color: string;
  active: boolean;
  sides?: ("top" | "bottom")[];
}) {
  return (
    <>
      {sides.map((s) => (
        <span
          key={s}
          className="absolute left-1/2 h-[7px] w-[7px] -translate-x-1/2 rounded-full border transition-colors duration-300"
          style={{
            [s]: -4,
            background: active ? color : "#d4d6de",
            borderColor: active
              ? "rgb(255 255 255 / 0.85)"
              : "#0b0c11",
            boxShadow: active
              ? `0 0 10px ${color}`
              : undefined,
          }}
        />
      ))}
    </>
  );
}

export function BoardGraph({
  className = "",
}: {
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState(680);

  const [active, setActive] =
    useState<Exclude<AgentId, "optimus">>("ultron");

  const [hover, setHover] = useState(false);

  useLayoutEffect(() => {
    const el = wrap.current;

    if (!el) return;

    const ro = new ResizeObserver(([e]) =>
      setWidth(e.contentRect.width),
    );

    ro.observe(el);

    setWidth(el.getBoundingClientRect().width);

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (hover) return;

    const t = setInterval(() => {
      setActive(
        (a) =>
          OWNERS[
            (OWNERS.indexOf(a) + 1) % OWNERS.length
          ],
      );
    }, 2400);

    return () => clearInterval(t);
  }, [hover]);

  const L = width < 560 ? mobile() : desktop();

  const scale = Math.min(
    1.12,
    width / L.w,
  );

  const optimus = getAgent("optimus")!;
  const act = getAgent(active)!;

  return (
    <div
      ref={wrap}
      className={`w-full ${className}`}
    >
      <style>{`
        @keyframes bg-flow {
          to {
            stroke-dashoffset: -20;
          }
        }

        .bg-flow {
          stroke-dasharray: 5 5;
          animation: bg-flow 0.9s linear infinite;
        }

        .bg-dash {
          stroke-dasharray: 3 5;
        }

        @media (prefers-reduced-motion: reduce) {
          .bg-flow {
            animation: none;
          }

          .bg-dot {
            display: none;
          }
        }
      `}</style>

      <div className="relative">
        {/* Deep neutral feathered edge — replaces the hard outer border */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-10 rounded-[36px] bg-transparent backdrop-blur-[30px]"
          style={{
            WebkitBackdropFilter: "blur(30px)",
            backdropFilter: "blur(30px)",
          }}
        />

        <div className="relative overflow-hidden rounded-[25px] bg-[#08090d]"
        style={{
          boxShadow: "0 0 60px 30px rgba(8,9,13,0.95), 0 0 120px 60px rgba(8,9,13,0.7)",
        }}>

          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                "radial-gradient(rgb(255 255 255 / 0.075) 1px, transparent 1px)",
              backgroundSize: "18px 18px",
            }}
          />

          <div className="pointer-events-none absolute -left-24 bottom-[-140px] h-[280px] w-[280px] rounded-full bg-[rgb(139_92_246/0.22)] blur-[70px]" />

          <div className="pointer-events-none absolute -right-24 bottom-[-140px] h-[280px] w-[280px] rounded-full bg-[rgb(61_123_255/0.18)] blur-[70px]" />

          

          <div
            className="relative mx-auto mt-2"
            style={{
              width: L.w * scale,
              height: L.h * scale,
            }}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: L.w,
                height: L.h,
                transform: `scale(${scale})`,
              }}
            >
              <svg
                className="absolute inset-0"
                width={L.w}
                height={L.h}
                viewBox={`0 0 ${L.w} ${L.h}`}
                fill="none"
              >
                <defs>
                  <linearGradient
                    id="bg-prism"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0"
                      stopColor="#3d7bff"
                    />

                    <stop
                      offset="1"
                      stopColor="#8b5cf6"
                    />
                  </linearGradient>

                  <filter
                    id="bg-glow"
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                  >
                    <feGaussianBlur stdDeviation="3" />
                  </filter>
                </defs>

                {OWNERS.map((id) => (
                  <path
                    key={id}
                    d={L.edges.owners[id]}
                    stroke="rgb(255 255 255 / 0.17)"
                    strokeWidth="1.2"
              className="bg-dash"
                  />
                ))}

                <path
                  d={L.edges.evidence}
                  className="bg-dash"
                  stroke="rgb(255 255 255 / 0.22)"
                  strokeWidth="1.2"
                />

                <path
                  d={L.edges.ledger}
                  className="bg-dash"
                  stroke="rgb(255 255 255 / 0.22)"
                  strokeWidth="1.2"
                />

                <path
                  d={L.edges.ceo}
                  stroke="rgb(255 255 255 / 0.22)"
                  strokeWidth="1.2"
                  strokeDasharray="4 6"
                  className="bg-dash"
                />

                <path
                  d={L.edges.owners[active]}
                  stroke={act.accent}
                  strokeWidth="4"
                  opacity="0.35"
                  filter="url(#bg-glow)"
                />

                <path
                  d={L.edges.owners[active]}
                  stroke={act.accent}
                  strokeWidth="1.6"
                  className="bg-flow"
                />

                <circle
                  key={active}
                  r="3.2"
                  fill="#fff"
                  className="bg-dot"
                  style={{
                    filter: `drop-shadow(0 0 6px ${act.accent})`,
                  }}
                >
                  <animateMotion
                    dur="1.6s"
                    repeatCount="indefinite"
                    path={L.edges.owners[active]}
                  />
                </circle>
              </svg>

              <div
                className="absolute flex items-center gap-2.5 rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,#1a1c24,#13141a)] px-2.5 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.8)]"
                style={{
                  left: L.ceo.x - L.ceo.w / 2,
                  top: L.ceo.y - L.ceo.h / 2,
                  width: L.ceo.w,
                  height: L.ceo.h,
                }}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border border-white/10 bg-[#0d0e13] text-[#fbbf24]">
                  <Zap size={15} strokeWidth={2.2} />
                </span>

                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[12.5px] font-semibold text-[var(--color-fg)]">
                    CEO request
                  </span>

                  <span className="block truncate text-[10.5px] text-[var(--color-muted)]">
                    Professor
                  </span>
                </span>

                <Handles
                  color="#8b5cf6"
                  active
                  sides={["bottom"]}
                />
              </div>

              <div
                className="absolute rounded-[16px] bg-[linear-gradient(135deg,#3d7bff,#8b5cf6_55%,#d946ef)] p-px shadow-[0_18px_50px_-16px_rgb(139_92_246/0.75)]"
                style={{
                  left:
                    L.chair.x - L.chair.w / 2,
                  top:
                    L.chair.y - L.chair.h / 2,
                  width: L.chair.w,
                  height: L.chair.h,
                }}
              >
                <div className="relative flex h-full items-center gap-3 rounded-[15px] bg-[linear-gradient(180deg,#1b1a2b,#121219)] px-3">
                  <img
                    src={optimus.avatar}
                    alt="Optimus"
                    className="h-9 w-9 shrink-0 rounded-[10px] object-cover ring-1 ring-white/15"
                  />

                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[13.5px] font-semibold text-white">
                      Optimus
                    </span>

                    <span className="block truncate text-[10.5px] text-[#b9b3d9]">
                      Chair · consensus
                    </span>
                  </span>

                  <span className="rounded-md border border-[rgb(139_92_246/0.5)] bg-[rgb(139_92_246/0.18)] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#d8ccff]">
                    Chair
                  </span>

                  <Handles
                    color="#8b5cf6"
                    active
                  />
                </div>
              </div>

              {(
                [
                  ["evidence", Search, "Evidence", "SearXNG"],
                  ["ledger", Database, "Ledger", "Appwrite"],
                ] as const
              ).map(([k, Icon, label, sub]) => {
                const p = L.tools[k];

                return (
                  <div
                    key={k}
                    className="absolute flex w-[92px] -translate-x-1/2 flex-col items-center"
                    style={{
                      left: p.x,
                      top: p.y - 22,
                    }}
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-[radial-gradient(circle_at_50%_30%,#20222c,#101117)] text-[var(--color-fg-2)] shadow-[0_8px_24px_-10px_rgb(0_0_0/0.9)]">
                      <Icon size={16} />
                    </span>

                    <span className="mt-1.5 text-[11px] font-medium text-[var(--color-fg-2)]">
                      {label}
                    </span>

                    <span className="text-[9.5px] text-[var(--color-faint)]">
                      {sub}
                    </span>
                  </div>
                );
              })}

              {OWNERS.map((id) => {
                const a = AGENTS.find(
                  (x) => x.id === id,
                )!;

                const b = L.owners[id];

                const on = active === id;

                return (
                  <button
                    key={id}
                    type="button"
                    onPointerEnter={(e) => {
                      if (e.pointerType !== "mouse")
                        return;

                      setHover(true);
                      setActive(id);
                    }}
                    onPointerLeave={() =>
                      setHover(false)
                    }
                    onClick={() => setActive(id)}
                    onFocus={() => {
                      setHover(true);
                      setActive(id);
                    }}
                    onBlur={() =>
                      setHover(false)
                    }
                    className="absolute flex items-center gap-2.5 rounded-[14px] border px-2.5 text-left outline-none transition-[border-color,box-shadow,transform] duration-300"
                    style={{
                      left:
                        b.x - b.w / 2,
                      top:
                        b.y - b.h / 2,
                      width: b.w,
                      height: b.h,
                      background: on
                        ? `linear-gradient(180deg, rgb(${a.rgb} / 0.14), #14151c 70%)`
                        : "linear-gradient(180deg,#1a1c24,#13141a)",
                      borderColor: on
                        ? `rgb(${a.rgb} / 0.75)`
                        : "rgb(255 255 255 / 0.09)",
                      boxShadow: on
                        ? `0 0 0 3px rgb(${a.rgb} / 0.14), 0 16px 40px -14px rgb(${a.rgb} / 0.7)`
                        : "0 10px 30px -14px rgb(0 0 0 / 0.8)",
                      transform: on
                        ? "translateY(-1px)"
                        : undefined,
                    }}
                    aria-label={`${a.name}, ${a.role}`}
                  >
                    <img
                      src={a.avatar}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-[9px] object-cover ring-1 ring-white/10"
                    />

                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-[12.5px] font-semibold text-[var(--color-fg)]">
                        {a.name}
                      </span>

                      <span className="block truncate text-[10.5px] text-[var(--color-muted)]">
                        {a.role}
                      </span>
                    </span>

                    <Handles
                      color={a.accent}
                      active={on}
                      sides={["top"]}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-center gap-2 px-4 pb-4 pt-1 text-[11px] text-[var(--color-muted)]">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: act.accent,
                boxShadow: `0 0 8px ${act.accent}`,
              }}
            />

            <span>
              Optimus routes the floor to{" "}
              <span className="text-[var(--color-fg-2)]">
                {act.name}
              </span>

              <span className="hidden sm:inline">
                {" "}· evidence first, then consensus
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
