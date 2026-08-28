import type { HTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { eyebrowClassName } from "@/components/ui/terminalStyles";

export type ArchivePreviewEmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  message: string;
  accent?: "cyan" | "pink";
};

const accentClassNames = {
  cyan: {
    surface: "bg-[linear-gradient(135deg,rgba(98,232,255,.055),transparent_45%),#0a1118]",
    icon: "border-[rgba(98,232,255,.35)] bg-[rgba(98,232,255,.065)] text-[var(--cyan)] shadow-[0_0_26px_rgba(98,232,255,.1)]",
    eyebrow: "text-[var(--cyan)]",
    rule: "bg-[rgba(98,232,255,.4)]",
  },
  pink: {
    surface: "bg-[linear-gradient(135deg,rgba(255,92,154,.055),transparent_45%),#0a1118]",
    icon: "border-[rgba(255,92,154,.35)] bg-[rgba(255,92,154,.065)] text-[var(--pink)] shadow-[0_0_26px_rgba(255,92,154,.1)]",
    eyebrow: "text-[var(--pink)]",
    rule: "bg-[rgba(255,92,154,.4)]",
  },
} as const;

export default function ArchivePreviewEmptyState({
  icon: Icon,
  eyebrow,
  title,
  message,
  accent = "cyan",
  className = "",
  ...props
}: ArchivePreviewEmptyStateProps) {
  const accentClasses = accentClassNames[accent];

  return (
    <div
      {...props}
      data-archive-preview-empty="true"
      className={`relative grid min-h-[430px] min-w-0 place-items-center overflow-hidden px-[28px] py-[34px] text-center max-[760px]:min-h-[360px] max-[760px]:px-[20px] max-[760px]:py-[28px] ${accentClasses.surface} ${className}`.trim()}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[15px] border border-dashed border-[rgba(139,151,169,.14)] max-[760px]:inset-[12px]"
      />
      <div className="relative z-[1] grid w-full max-w-[340px] justify-items-center gap-[18px]">
        <div className={`grid h-[76px] w-[76px] place-items-center border ${accentClasses.icon}`}>
          <Icon aria-hidden="true" size={30} strokeWidth={1.5} />
        </div>
        <div className="grid justify-items-center gap-[10px]">
          <p className={`${eyebrowClassName} !mb-0 ${accentClasses.eyebrow}`}>{eyebrow}</p>
          <h2 className="m-0 max-w-[300px] text-[21px] leading-[1.25] [overflow-wrap:anywhere]">{title}</h2>
          <span aria-hidden="true" className={`my-[3px] h-px w-[46px] ${accentClasses.rule}`} />
          <p className="m-0 max-w-[300px] text-[11px] leading-[1.7] text-[var(--muted)] [overflow-wrap:anywhere]">{message}</p>
        </div>
      </div>
    </div>
  );
}