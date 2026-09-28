"use client";

import { useRouter } from "next/navigation";

import { PromptComposer } from "@/components/ui/PromptComposer";
import { FogBorder, FogRail } from "./Fog";

export function Hero({ className = "" }: { className?: string }) {
  const router = useRouter();
  const convene = (t: string) =>
    router.push(`/board?prompt=${encodeURIComponent(t)}`);

  return (
    <section
      className={`relative isolate sm:overflow-hidden sm:rounded-[28px] sm:bg-[linear-gradient(180deg,rgb(255_255_255/0.025),transparent_70%)] ${className}`}
    >
      <FogBorder fade="left" className="hidden sm:block" />

      <div className="relative -mx-4 h-[292px] overflow-hidden sm:absolute sm:inset-y-0 sm:right-0 sm:mx-0 sm:h-auto sm:w-[60%] sm:overflow-visible">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/boardroom-hero.webp"
          alt="Professor-XMD board room"
          className="h-full w-full object-cover object-[50%_30%] [mask-image:radial-gradient(135%_92%_at_50%_18%,#000_42%,transparent_78%)] [-webkit-mask-image:radial-gradient(135%_92%_at_50%_18%,#000_42%,transparent_78%)] sm:object-[100%_40%] sm:[mask-image:linear-gradient(90deg,transparent_0%,transparent_16%,rgb(0_0_0/0.22)_38%,#000_68%),linear-gradient(0deg,transparent_0%,#000_36%)] sm:[-webkit-mask-image:linear-gradient(90deg,transparent_0%,transparent_16%,rgb(0_0_0/0.22)_38%,#000_68%),linear-gradient(0deg,transparent_0%,#000_36%)] sm:[mask-composite:intersect] sm:[-webkit-mask-composite:source-in]"
        />

        <div className="pointer-events-none absolute left-1/2 top-[18%] h-40 w-40 -translate-x-1/2 rounded-full bg-[rgb(139_92_246/0.28)] blur-[60px] sm:left-[70%]" />

      </div>

      <div className="relative -mt-[76px] flex flex-col sm:mt-0 sm:min-h-[500px] sm:justify-end sm:p-8 xl:min-h-[520px]">

        <h2 className="max-w-[560px] text-[33px] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-[46px]">
          Five AI engineers.
          <br />
          <span className="text-prism">One table. Your project.</span>
        </h2>

        <p className="mt-3 max-w-[470px] text-[14px] leading-[1.6] text-[var(--color-fg-2)] sm:text-[14.5px]">
          Describe what you want to build. The board researches, debates,
          locks decisions with evidence — and files a full Swahili report.
        </p>

        <PromptComposer
          onSubmit={convene}
          className="mt-5 max-w-[620px] sm:mt-6"
        />

      </div>
    </section>
  );
}
