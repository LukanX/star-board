import { Extension } from "@tiptap/core";
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import type { NoteVisibility } from "@/lib/campaign/types";

export type NoteEntitySearchResult = {
  id: string;
  type: string;
  label: string;
  meta: string;
  href: string;
};

type NoteEntitySuggestionOptions = {
  campaignId: string;
  noteId?: string;
  audience: NoteVisibility;
};

const entityTypeOrder = ["characters", "npcs", "places", "factions", "jobs", "enemies", "episodes"];
const entityTypeLabels: Record<string, string> = {
  characters: "CHARACTERS",
  npcs: "NPCS",
  places: "PLACES",
  factions: "FACTIONS",
  jobs: "JOBS",
  enemies: "ENEMIES",
  episodes: "EPISODES",
};

function renderItems(container: HTMLElement, items: NoteEntitySearchResult[], selectedIndex: number) {
  container.replaceChildren();
  let currentType = "";
  let currentGroup: HTMLDivElement | null = null;

  items.forEach((item, index) => {
    if (item.type !== currentType) {
      currentType = item.type;
      currentGroup = document.createElement("div");
      currentGroup.setAttribute("role", "group");
      currentGroup.setAttribute("aria-label", entityTypeLabels[currentType] ?? currentType);
      const label = document.createElement("p");
      label.className = "m-0 px-3 pb-1 pt-2 text-[var(--dim)] font-mono text-[8px] tracking-[.12em]";
      label.textContent = entityTypeLabels[currentType] ?? currentType.toUpperCase();
      currentGroup.append(label);
      container.append(currentGroup);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.id = `note-entity-option-${index}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(index === selectedIndex));
    button.className = `flex w-full items-start justify-between gap-4 border-0 bg-transparent px-3 py-2 text-left ${index === selectedIndex ? "bg-[rgba(98,232,255,.1)] text-[var(--ink)]" : "text-[var(--muted)] hover:bg-[rgba(255,255,255,.04)]"}`;
    const copy = document.createElement("span");
    copy.className = "grid min-w-0 gap-1";
    const name = document.createElement("span");
    name.className = "truncate font-mono text-[10px]";
    name.textContent = `@${item.label}`;
    copy.append(name);
    if (item.meta) {
      const meta = document.createElement("span");
      meta.className = "truncate text-[var(--dim)] font-mono text-[8px]";
      meta.textContent = item.meta;
      copy.append(meta);
    }
    button.append(copy);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      container.dispatchEvent(new CustomEvent("note-entity-select", { detail: index }));
    });
    currentGroup?.append(button);
  });
}

export const NoteEntitySuggestion = Extension.create<NoteEntitySuggestionOptions>({
  name: "noteEntitySuggestion",

  addOptions() {
    return {
      campaignId: "",
      noteId: undefined,
      audience: "player" as const,
    };
  },

  addProseMirrorPlugins() {
    const { campaignId, noteId, audience } = this.options;

    return [Suggestion<NoteEntitySearchResult>({
      editor: this.editor,
      char: "@",
      minQueryLength: 2,
      debounce: 250,
      items: async ({ query, signal }) => {
        const params = new URLSearchParams({ q: query, audience });
        if (noteId) params.set("noteId", noteId);
        const response = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/entities/search?${params.toString()}`,
          { signal },
        );
        if (!response.ok) return [];
        const result = await response.json() as { entities?: NoteEntitySearchResult[] };
        return [...(result.entities ?? [])].sort((left, right) => {
          const leftType = entityTypeOrder.indexOf(left.type);
          const rightType = entityTypeOrder.indexOf(right.type);
          return leftType - rightType || left.label.localeCompare(right.label);
        });
      },
      command: ({ editor, range, props }) => {
        editor.chain().focus().insertContentAt(range, {
          type: "text",
          text: `@${props.label}`,
          marks: [{ type: "link", attrs: { href: props.href } }],
        }).run();
      },
      render: () => {
        let container: HTMLDivElement | null = null;
        let unmount: (() => void) | undefined;
        let currentProps: SuggestionProps<NoteEntitySearchResult> | null = null;
        let selectedIndex = 0;

        const renderCurrentItems = () => {
          if (container && currentProps) renderItems(container, currentProps.items, selectedIndex);
        };

        return {
          onStart(props) {
            currentProps = props;
            selectedIndex = 0;
            container = document.createElement("div");
            container.className = "z-[100] max-h-64 min-w-56 max-w-[min(22rem,calc(100vw-2rem))] overflow-y-auto border border-[var(--line)] bg-[#0a1118] shadow-[0_12px_32px_rgba(0,0,0,.5)]";
            container.id = `note-entity-list-${campaignId}`;
            container.setAttribute("role", "listbox");
            container.setAttribute("aria-label", "Campaign entity references");
            props.editor.view.dom.setAttribute("aria-controls", container.id);
            props.editor.view.dom.setAttribute("aria-expanded", String(props.items.length > 0));
            container.addEventListener("note-entity-select", ((event: CustomEvent<number>) => {
              const item = currentProps?.items[event.detail];
              if (item) currentProps?.command(item);
            }) as EventListener);
            renderCurrentItems();
            unmount = props.mount(container);
          },
          onUpdate(props) {
            currentProps = props;
            selectedIndex = Math.min(selectedIndex, Math.max(0, props.items.length - 1));
            props.editor.view.dom.setAttribute("aria-expanded", String(props.items.length > 0));
            if (props.items.length) props.editor.view.dom.setAttribute("aria-activedescendant", `note-entity-option-${selectedIndex}`);
            renderCurrentItems();
          },
          onKeyDown({ event }) {
            if (event.key === "Escape") return false;
            if (event.key === "ArrowDown" && currentProps?.items.length) {
              event.preventDefault();
              selectedIndex = (selectedIndex + 1) % currentProps.items.length;
              renderCurrentItems();
              currentProps.editor.view.dom.setAttribute("aria-activedescendant", `note-entity-option-${selectedIndex}`);
              return true;
            }
            if (event.key === "ArrowUp" && currentProps?.items.length) {
              event.preventDefault();
              selectedIndex = (selectedIndex - 1 + currentProps.items.length) % currentProps.items.length;
              renderCurrentItems();
              currentProps.editor.view.dom.setAttribute("aria-activedescendant", `note-entity-option-${selectedIndex}`);
              return true;
            }
            if (event.key === "Enter" && currentProps?.items[selectedIndex]) {
              event.preventDefault();
              currentProps.command(currentProps.items[selectedIndex]);
              return true;
            }
            return false;
          },
          onExit() {
            unmount?.();
            currentProps?.editor.view.dom.removeAttribute("aria-controls");
            currentProps?.editor.view.dom.removeAttribute("aria-expanded");
            currentProps?.editor.view.dom.removeAttribute("aria-activedescendant");
            container = null;
            currentProps = null;
          },
        };
      },
    })];
  },
});