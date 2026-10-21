// src/lib/milestone/flag.ts — feature flag ya pipeline ya milestones (maelezo0 §8). Default OFF.
export function milestonesEnabled(): boolean {
  return /^(1|true|on)$/i.test(String(process.env.XMD_MILESTONES || "").trim());
}

/** TASK-32 (E2E run 6): server ya PILI (Render, code ya zamani, bila XMD_MILESTONES) inayoshiriki Supabase ile ile iliendeleza
 *  session ya milestones kwa njia ya ZAMANI (Mpango Kazi + Computer ya mradi mzima) → "completed" huku M1/M4 hazijaisha.
 *  Kinga: session yenye ramani ya milestones HAIENDELEZWI kamwe na server ambayo flag imezimwa — inabaki paused. */
export function milestoneResumeBlocked(hasMilestoneMap: boolean, enabled: boolean = milestonesEnabled()): boolean {
  return hasMilestoneMap && !enabled;
}
