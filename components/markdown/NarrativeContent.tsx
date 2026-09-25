import { MarkdownContent } from "@/components/markdown/MarkdownContent";

export default function NarrativeContent({
  source,
  isMarkdown,
  className = "",
  suppressAutolinkLiterals = false,
}: {
  source: string;
  isMarkdown: boolean;
  className?: string;
  suppressAutolinkLiterals?: boolean;
}) {
  if (isMarkdown) {
    return <MarkdownContent source={source} className={className} preserveSoftBreaks suppressAutolinkLiterals={suppressAutolinkLiterals} />;
  }

  return (
    <div className={`min-w-0 whitespace-pre-wrap break-words text-[var(--muted)] text-[11px] leading-[1.7] ${className}`.trim()}>
      {source}
    </div>
  );
}