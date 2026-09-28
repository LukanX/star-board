import type { JSONContent } from "@tiptap/core";

export function plainTextToDocument(value: string): JSONContent {
  if (!value) return { type: "doc", content: [{ type: "paragraph" }] };

  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const paragraphs: JSONContent[] = [];
  let inlineContent: JSONContent[] = [];
  let emptyLines = 0;

  for (const line of lines) {
    if (!line) {
      emptyLines += 1;
      continue;
    }

    if (emptyLines) {
      if (inlineContent.length) {
        paragraphs.push({ type: "paragraph", content: inlineContent });
        for (let index = 1; index < emptyLines; index += 1) {
          paragraphs.push({ type: "paragraph" });
        }
      } else {
        for (let index = 0; index < emptyLines; index += 1) {
          paragraphs.push({ type: "paragraph" });
        }
      }
      inlineContent = [];
      emptyLines = 0;
    } else if (inlineContent.length) {
      inlineContent.push({ type: "hardBreak" });
    }

    inlineContent.push({ type: "text", text: line });
  }

  if (inlineContent.length) {
    paragraphs.push({
      type: "paragraph",
      content: inlineContent,
    });
  }
  for (let index = 0; index < emptyLines; index += 1) {
    paragraphs.push({ type: "paragraph" });
  }

  return { type: "doc", content: paragraphs };
}