import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MarkdownEntityLink from "@/components/markdown/MarkdownEntityLink";
import type { Root } from "mdast";
import type { Plugin } from "unified";

const markdownContentClassName =
  "text-[var(--muted)] text-[11px] leading-[1.7] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_h1]:text-[var(--ink)] [&_h1]:text-[20px] [&_h1]:tracking-normal [&_h2]:text-[var(--ink)] [&_h2]:text-[16px] [&_h2]:tracking-normal [&_h3]:text-[var(--ink)] [&_h3]:text-[13px] [&_h3]:tracking-normal [&_a]:text-[var(--cyan)] [&_code]:text-[var(--amber)] [&_code]:font-mono [&_code]:text-[.9em] [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-[var(--line)] [&_pre]:bg-[#080d14] [&_pre]:p-3 [&_pre_code]:text-[var(--muted)] [&_blockquote]:ml-0 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--pink)] [&_blockquote]:pl-3 [&_blockquote]:text-[#b3bfce] [&_ul]:pl-[19px] [&_ol]:pl-[19px]";
const markdownPlugins = [remarkGfm];
const demoteLiteralAutolinks: Plugin<[], Root> = () => (tree, file) => {
  if (typeof file.value !== "string") return;
  const source = file.value;
  type Node = {
    type?: string;
    url?: string;
    value?: string;
    children?: Node[];
    position?: { start?: { offset?: number }; end?: { offset?: number } };
  };
  const textContent = (nodes: Node[]): string => nodes.map((node) =>
    node.type === "text" || node.type === "inlineCode" ? node.value ?? "" : textContent(node.children ?? []),
  ).join("");
  const walk = (parent: Node) => {
    if (!parent.children) return;
    for (let index = 0; index < parent.children.length; index += 1) {
      const node = parent.children[index];
      const start = node.position?.start?.offset;
      const end = node.position?.end?.offset;
      if (node.type === "link" && typeof node.url === "string" && typeof start === "number" && typeof end === "number") {
        const raw = source.slice(start, end);
        const label = textContent(node.children ?? []);
        const bareUrl = raw === node.url || raw === label || raw === `<${node.url}>`
          || (raw === label && (node.url === `http://${raw}` || node.url === `mailto:${raw}`));
        if (bareUrl && label) {
          parent.children[index] = { type: "text", value: label, position: node.position };
          continue;
        }
      }
      walk(node);
    }
  };
  walk(tree as unknown as Node);
};
const legacyRichMarkdownPlugins = [remarkGfm, demoteLiteralAutolinks];

type MarkdownContentProps = {
  source: string;
  className?: string;
  preserveSoftBreaks?: boolean;
  suppressAutolinkLiterals?: boolean;
};

export function MarkdownContent({
  source,
  className = "",
  preserveSoftBreaks = false,
  suppressAutolinkLiterals = false,
}: MarkdownContentProps) {
  return (
    <div
      className={`markdown-content ${markdownContentClassName} ${preserveSoftBreaks ? "whitespace-pre-wrap" : ""} ${className}`.trim()}
    >
      <ReactMarkdown
        components={{ a: MarkdownEntityLink }}
        remarkPlugins={suppressAutolinkLiterals ? legacyRichMarkdownPlugins : markdownPlugins}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
