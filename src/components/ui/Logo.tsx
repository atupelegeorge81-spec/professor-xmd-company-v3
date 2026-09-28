import { cn } from "@/lib/utils";
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-[10px] bg-black", className)} style={{ width: size, height: size, boxShadow: "0 0 0 1px rgb(255 255 255 / 0.08), 0 6px 20px -6px rgb(139 92 246 / 0.6)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo.webp" alt="PROFESSOR-XMD" width={size * 2} height={size * 2} className="h-full w-full scale-[1.18] object-cover" />
    </span>
  );
}
