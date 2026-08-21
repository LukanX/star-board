import type { ReactNode } from "react";

export type RecordPortraitProps = {
  src: string | null;
  label: string;
  className?: string;
  fallback?: ReactNode;
};

export function RecordPortrait({ src, label, className = "", fallback = null }: RecordPortraitProps) {
  return <div aria-label={label} className={className} role={src ? "img" : undefined} style={src ? { backgroundImage: `url(${src})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>{src ? null : fallback}</div>;
}

export default RecordPortrait;