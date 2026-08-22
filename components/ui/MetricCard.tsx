import type { LucideIcon } from "lucide-react";

export type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  accent: string;
};

const accentClassNames: Record<string, string> = {
  cyan: "text-[var(--cyan)]",
  pink: "text-[var(--pink)]",
  amber: "text-[var(--amber)]",
  purple: "text-[var(--purple)]",
};

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: MetricCardProps) {
  const accentClassName = accentClassNames[accent] ?? accentClassNames.cyan;

  return (
    <div
      className={`${accentClassName} relative min-h-[127px] overflow-hidden border border-[var(--line)] bg-[var(--panel)] px-[17px] pb-[13px] pt-4 before:absolute before:right-[-21px] before:top-[-37px] before:h-[110px] before:w-[110px] before:rotate-45 before:border before:border-current before:opacity-[.12] before:content-[''] max-[760px]:min-h-[113px] max-[760px]:p-[13px]`}
    >
      <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
        <span>{label}</span>
        <Icon className="opacity-90" size={16} />
      </div>
      <strong className="mt-[11px] block font-mono text-[29px] font-medium leading-none text-[var(--ink)] max-[760px]:!text-[24px]">
        {value}
      </strong>
      <small className="mt-2 block text-[10px] text-[var(--dim)]">
        {detail}
      </small>
      <div className="absolute bottom-0 left-0 h-0.5 w-full bg-[rgba(255,255,255,.04)]">
        <span className="block h-full w-[68%] bg-current shadow-[0_0_11px_currentColor]" />
      </div>
    </div>
  );
}

export default MetricCard;
