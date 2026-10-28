import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  alt?: string | null;
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  checked?: boolean | null;
  align?: ("left" | "right" | "center" | null)[];
  children?: MarkdownNode[];
};

const parser = unified().use(remarkParse).use(remarkGfm);

function isCampaignPath(href: string): boolean {
  try {
    return new URL(href, "https://star-board.invalid").pathname.startsWith("/campaigns/");
  } catch {
    return true;
  }
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/@(?=[A-Za-z][A-Za-z0-9]*\[)/g, "&#64;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderTableRow(node: MarkdownNode, header: boolean, align: MarkdownNode["align"] = []): string {
  const cellTag = header ? "th" : "td";
  const cells = (node.children ?? []).map((cell, index) => {
    const alignment = align?.[index];
    const attribute = alignment ? ` align="${alignment}"` : "";
    return `<${cellTag}${attribute}>${renderNodes(cell.children ?? [])}</${cellTag}>`;
  });
  return `<tr>${cells.join("")}</tr>`;
}

function renderNode(node: MarkdownNode): string {
  const children = renderNodes(node.children ?? []);
  switch (node.type) {
    case "root":
      return children;
    case "text":
      return escapeText(node.value ?? "");
    case "html":
      return "";
    case "image":
      return escapeText(node.alt ?? "");
    case "link": {
      const href = node.url ?? "";
      if (isCampaignPath(href) || !/^(?:https?:\/\/|mailto:|#)/i.test(href)) return children;
      const title = node.title ? ` title="${escapeAttribute(node.title)}"` : "";
      return `<a href="${escapeAttribute(href)}"${title} rel="noopener noreferrer">${children}</a>`;
    }
    case "linkReference":
      return children;
    case "imageReference":
      return escapeText(node.alt ?? "");
    case "paragraph":
      return `<p>${children}</p>`;
    case "heading": {
      const depth = Math.min(Math.max(node.depth ?? 1, 1), 6);
      return `<h${depth}>${children}</h${depth}>`;
    }
    case "strong":
      return `<strong>${children}</strong>`;
    case "emphasis":
      return `<em>${children}</em>`;
    case "delete":
      return `<del>${children}</del>`;
    case "inlineCode":
      return `<code>${escapeText(node.value ?? "")}</code>`;
    case "code":
      return `<pre><code>${escapeText(node.value ?? "")}</code></pre>`;
    case "break":
      return "<br />";
    case "thematicBreak":
      return "<hr />";
    case "blockquote":
      return `<blockquote>${children}</blockquote>`;
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const start = node.ordered && node.start && node.start !== 1 ? ` start="${Math.trunc(node.start)}"` : "";
      return `<${tag}${start}>${children}</${tag}>`;
    }
    case "listItem": {
      const marker = node.checked === true ? "[x] " : node.checked === false ? "[ ] " : "";
      return `<li>${marker}${children}</li>`;
    }
    case "table": {
      const rows = node.children ?? [];
      if (!rows.length) return "<table></table>";
      const header = renderTableRow(rows[0], true, node.align);
      const body = rows.slice(1).map((row) => renderTableRow(row, false, node.align)).join("");
      return `<table><thead>${header}</thead>${body ? `<tbody>${body}</tbody>` : ""}</table>`;
    }
    default:
      return children;
  }
}

function renderNodes(nodes: MarkdownNode[]): string {
  return nodes.map(renderNode).join("");
}

export function renderFoundryMarkdown(markdown: string): string {
  if (!markdown) return "";
  const tree = parser.parse(markdown) as unknown as MarkdownNode;
  return renderNode(tree);
}