import type { Agent } from "@/lib/team";
import { cn } from "@/lib/utils";

type Status = "idle" | "online" | "thinking" | "speaking";

export function AgentAvatar({
  agent,
  size = 36,
  status,
  ring = true,
  className,
}: {
  agent: Agent;
  size?: number;
  status?: Status;
  ring?: boolean;
  className?: string;
}) {
  const dot = Math.max(8, Math.round(size * 0.26));
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center rounded-full", className)}
      style={{ width: size, height: size }}
    >
      <span
        className={cn("absolute inset-0 rounded-full", status === "speaking" && "animate-[pulse-ring_1.8s_infinite]")}
        style={{
          ["--ring" as string]: `rgb(${agent.rgb} / 0.6)`,
          boxShadow: ring ? `0 0 0 1.5px rgb(${agent.rgb} / 0.55), 0 4px 14px -4px rgb(${agent.rgb} / 0.5)` : undefined,
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={agent.avatar}
        alt={agent.name}
        width={size * 2}
        height={size * 2}
        loading="lazy"
        decoding="async"
        className="h-full w-full rounded-full object-cover"
        style={{ transform: "scale(1.12)", clipPath: "circle(44.6%)" }}
      />
      {status && status !== "idle" && (
        <span
          className="absolute -bottom-0 -right-0 rounded-full border-2 border-[var(--color-bg)]"
          style={{
            width: dot,
            height: dot,
            background: status === "online" ? "var(--color-ok)" : agent.accent,
          }}
        />
      )}
    </span>
  );
}

export function AvatarStack({ agents, size = 26, max = 5 }: { agents: Agent[]; size?: number; max?: number }) {
  const shown = agents.slice(0, max);
  return (
    <span className="flex items-center">
      {shown.map((a, i) => (
        <span key={a.id} className="rounded-full ring-2 ring-[var(--color-ink-1)]" style={{ marginLeft: i ? -size * 0.32 : 0, zIndex: 10 - i }}>
          <AgentAvatar agent={a} size={size} ring={false} />
        </span>
      ))}
      {agents.length > max && (
        <span className="ml-1 text-[11px] text-[var(--color-muted)]">+{agents.length - max}</span>
      )}
    </span>
  );
}
