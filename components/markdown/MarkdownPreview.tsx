import type { HTMLAttributes, ReactNode } from "react";

type MarkdownPreviewProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "className"> & {
  children: ReactNode;
  className?: string;
};

type MarkdownPreviewToolbarProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "className"> & {
  children: ReactNode;
  className?: string;
};

const previewClassName = "min-w-0 border border-[rgba(98,232,255,.25)] bg-[#0a1118] p-[15px] [&_p]:m-[15px_0_0] [&_p]:text-[var(--muted)] [&_p]:font-mono [&_p]:text-[10px] [&_p]:leading-[1.7] [&_strong]:font-medium [&_strong]:text-[var(--ink)]";
const toolbarClassName = "flex items-center gap-[7px] border-b border-[var(--line)] pb-[11px] text-[var(--cyan)] font-mono text-[9px] tracking-[.11em] [&>span]:ml-auto [&>span]:text-[var(--green)] [&>span]:text-[7px]";

export function MarkdownPreview({ children, className = "", ...props }: MarkdownPreviewProps) {
  return <div {...props} className={`${previewClassName} ${className}`.trim()}>{children}</div>;
}

export function MarkdownPreviewToolbar({ children, className = "", ...props }: MarkdownPreviewToolbarProps) {
  return <div {...props} data-markdown-toolbar="true" className={`${toolbarClassName} ${className}`.trim()}>{children}</div>;
}

export default MarkdownPreview;