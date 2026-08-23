import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownContentClassName =
  "text-[var(--muted)] text-[11px] leading-[1.7] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_h1]:text-[var(--ink)] [&_h1]:text-[20px] [&_h1]:tracking-normal [&_h2]:text-[var(--ink)] [&_h2]:text-[16px] [&_h2]:tracking-normal [&_h3]:text-[var(--ink)] [&_h3]:text-[13px] [&_h3]:tracking-normal [&_a]:text-[var(--cyan)] [&_code]:text-[var(--amber)] [&_code]:font-mono [&_code]:text-[.9em] [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-[var(--line)] [&_pre]:bg-[#080d14] [&_pre]:p-3 [&_pre_code]:text-[var(--muted)] [&_blockquote]:ml-0 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--pink)] [&_blockquote]:pl-3 [&_blockquote]:text-[#b3bfce] [&_ul]:pl-[19px] [&_ol]:pl-[19px]";

type MarkdownContentProps = {
  source: string;
  className?: string;
};

export function MarkdownContent({
  source,
  className = "",
}: MarkdownContentProps) {
  return (
    <div
      className={`markdown-content ${markdownContentClassName} ${className}`.trim()}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
