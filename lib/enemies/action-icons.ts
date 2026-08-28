const actionIcons = {
  "one-action": { glyph: "\u0031", label: "1 action" },
  "two-actions": { glyph: "\u0032", label: "2 actions" },
  "three-actions": { glyph: "\u0033", label: "3 actions" },
  "free-action": { glyph: "\u0034", label: "free action" },
  reaction: { glyph: "\u0035", label: "reaction" },
} as const;

type ActionIconName = keyof typeof actionIcons;

const actionIconNamesByValue: Record<string, ActionIconName> = {
  "1": "one-action",
  "1 action": "one-action",
  "1-action": "one-action",
  "one action": "one-action",
  "one-action": "one-action",
  "2": "two-actions",
  "2 action": "two-actions",
  "2 actions": "two-actions",
  "2-action": "two-actions",
  "2-actions": "two-actions",
  "two action": "two-actions",
  "two-actions": "two-actions",
  "3": "three-actions",
  "3 action": "three-actions",
  "3 actions": "three-actions",
  "3-action": "three-actions",
  "3-actions": "three-actions",
  "three action": "three-actions",
  "three-actions": "three-actions",
  "4": "free-action",
  "4 action": "free-action",
  "4-action": "free-action",
  "free action": "free-action",
  "free-action": "free-action",
  "5": "reaction",
  reaction: "reaction",
};

export function getActionIcon(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const actionName = normalized ? actionIconNamesByValue[normalized] : undefined;
  return actionName ? { name: actionName, ...actionIcons[actionName] } : null;
}