import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { unified } from "unified";

type MarkdownNode = { type?: string; value?: string; alt?: string; children?: MarkdownNode[] };
const markdownProcessor = unified().use(remarkParse).use(remarkGfm);

function collectVisibleText(node: MarkdownNode, result: string[]) {
  if (node.type === "text" || node.type === "inlineCode" || node.type === "code") {
    if (node.value) result.push(node.value);
    return;
  }
  if (node.type === "image") {
    if (node.alt) result.push(node.alt);
    return;
  }
  if (node.type === "break" || node.type === "paragraph" || node.type === "heading" || node.type === "listItem" || node.type === "tableCell") {
    result.push(" ");
  }
  node.children?.forEach((child) => collectVisibleText(child, result));
}

export function markdownExcerpt(source: string, maxLength = 180): string {
  try {
    const parts: string[] = [];
    collectVisibleText(markdownProcessor.parse(source) as MarkdownNode, parts);
    const plainText = parts.join("").replace(/\s+/g, " ").trim();
    if (plainText.length <= maxLength) return plainText;
    return `${plainText.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  } catch {
    return source.replace(/\s+/g, " ").trim().slice(0, maxLength);
  }
}