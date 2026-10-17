// src/lib/milestone/flag.ts — feature flag ya pipeline ya milestones (maelezo0 §8). Default OFF.
export function milestonesEnabled(): boolean {
  return /^(1|true|on)$/i.test(String(process.env.XMD_MILESTONES || "").trim());
}
