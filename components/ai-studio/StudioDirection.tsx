"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { searchCampaignEntities, type CampaignEntitySearchResult } from "@/lib/campaign/entity-search";
import { directionMention, insertDirectionMention, subjectKindBySection, visualSubjectSections } from "./studioSubjects";
import { studioInput, studioKindLabels, studioKindTones, studioLabel } from "./studioStyles";

type SuggestionPlacement = { left: number; top: number; width: number; maxHeight: number; above: boolean };

function measureCaret(element: HTMLTextAreaElement) {
  // Textareas do not expose caret geometry; mirror their typography, wrapping and scroll position.
  const style = getComputedStyle(element);
  const mirror = document.createElement("div");
  for (const property of [
    "direction", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariant",
    "fontKerning", "fontFeatureSettings", "fontVariationSettings", "lineHeight",
    "letterSpacing", "wordSpacing", "textAlign", "textIndent", "textTransform", "tabSize", "wordBreak",
  ] as const) mirror.style[property] = style[property];
  mirror.style.boxSizing = "border-box";
  mirror.style.width = `${element.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`;
  mirror.style.position = "fixed";
  mirror.style.left = "0";
  mirror.style.top = "0";
  mirror.style.margin = "0";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.whiteSpace = element.wrap === "off" ? "pre" : "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.setAttribute("aria-hidden", "true");
  mirror.textContent = element.value.slice(0, element.selectionStart);
  const marker = document.createElement("span");
  marker.textContent = element.value.slice(element.selectionStart) || "\u200b";
  mirror.append(marker);
  document.body.append(mirror);
  try {
    const markerRect = marker.getClientRects()[0];
    if (!markerRect) return null;
    const field = element.getBoundingClientRect();
    const origin = mirror.getBoundingClientRect();
    const top = field.top + markerRect.top - origin.top - element.scrollTop;
    return { left: field.left + markerRect.left - origin.left - element.scrollLeft, top, bottom: top + markerRect.height };
  } finally {
    mirror.remove();
  }
}

export default function StudioDirection({ campaignId, kind, value, disabled, onChange, onMention }: {
  campaignId: string; kind: "scene" | "battlemap"; value: string; disabled: boolean;
  onChange: (value: string) => void;
  onMention: (item: CampaignEntitySearchResult, direction: string, signal: AbortSignal) => Promise<boolean>;
}) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const selection = useRef<AbortController | null>(null);
  const [caret, setCaret] = useState(0);
  const [results, setResults] = useState<{ signature: string; items: CampaignEntitySearchResult[] }>({ signature: "", items: [] });
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState("");
  const [placement, setPlacement] = useState<SuggestionPlacement | null>(null);
  const mention = directionMention(value, caret);
  const signature = `${value}:${caret}`;
  const items = results.signature === signature ? results.items : [];
  const query = !disabled && !selecting && dismissed !== signature ? mention?.query ?? "" : "";
  const popupVisible = Boolean(query && placement);

  const updatePlacement = useCallback((element = textarea.current) => {
    if (!element) return;
    const caretRect = measureCaret(element);
    const field = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const right = left + (viewport?.width ?? window.innerWidth);
    const bottom = top + (viewport?.height ?? window.innerHeight);
    if (!caretRect || caretRect.bottom <= Math.max(top, field.top) || caretRect.top >= Math.min(bottom, field.bottom)) {
      setPlacement(null); return;
    }
    const below = bottom - caretRect.bottom - 14;
    const above = caretRect.top - top - 14;
    const desiredHeight = Math.min(256, popup.current?.scrollHeight ?? 256);
    const showAbove = below < desiredHeight && above > below;
    const width = Math.min(352, right - left - 16);
    const maxHeight = Math.min(256, showAbove ? above : below);
    if (width <= 0 || maxHeight <= 0) { setPlacement(null); return; }
    const next = {
      left: Math.max(left + 8, Math.min(caretRect.left, right - width - 8)),
      top: showAbove ? caretRect.top - 6 : caretRect.bottom + 6,
      width, maxHeight, above: showAbove,
    };
    setPlacement((current) => current?.left === next.left && current.top === next.top && current.width === next.width && current.maxHeight === next.maxHeight && current.above === next.above ? current : next);
  }, []);

  useEffect(() => () => selection.current?.abort(), []);
  useEffect(() => {
    if (!query) return;
    let frame = 0;
    const refresh = (event?: Event) => {
      if (event?.target instanceof Node && popup.current?.contains(event.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => updatePlacement());
    };
    const observer = new ResizeObserver(() => refresh());
    if (textarea.current) observer.observe(textarea.current);
    if (popup.current) observer.observe(popup.current);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    document.fonts.addEventListener("loadingdone", refresh);
    window.visualViewport?.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("scroll", refresh);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
      document.fonts.removeEventListener("loadingdone", refresh);
      window.visualViewport?.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("scroll", refresh);
    };
  }, [query, popupVisible, updatePlacement]);
  useEffect(() => {
    if (query) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id, query, results, popupVisible]);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError(null); setActive(0);
      void searchCampaignEntities({ campaignId, query, audience: "gm", sections: kind === "battlemap" ? ["places"] : visualSubjectSections, signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          if ("error" in result) setError(result.error);
          else setResults({ signature, items: result.entities.filter((item) => subjectKindBySection[item.type]).sort((a, b) => visualSubjectSections.indexOf(a.type as typeof visualSubjectSections[number]) - visualSubjectSections.indexOf(b.type as typeof visualSubjectSections[number]) || a.label.localeCompare(b.label)) });
        })
        .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Subject search failed."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [campaignId, kind, query, signature]);

  function updateCaret(element: HTMLTextAreaElement) {
    setCaret(element.selectionStart);
    if (directionMention(element.value, element.selectionStart)) updatePlacement(element);
    else setPlacement(null);
  }

  async function choose(item: CampaignEntitySearchResult) {
    if (!mention || selecting || selection.current) return;
    const inserted = insertDirectionMention(value, mention, item.label);
    if ("error" in inserted) { setError(inserted.error); return; }
    const controller = new AbortController();
    selection.current = controller; setSelecting(true); setError(null);
    try {
      if (await onMention(item, inserted.direction, controller.signal) && !controller.signal.aborted) {
        setDismissed(`${inserted.direction}:${inserted.caret}`); setCaret(inserted.caret);
        requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(inserted.caret, inserted.caret); });
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "The selected subject could not be added.");
    } finally {
      if (selection.current === controller) selection.current = null;
      if (!controller.signal.aborted) setSelecting(false);
    }
  }

  return <div className="relative min-w-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && !popup.current?.contains(event.relatedTarget)) setDismissed(signature); }}>
    <label className={studioLabel} htmlFor="studio-direction">Direction <span className="text-[var(--dim)]">{value.length}/1200</span></label>
    <textarea ref={textarea} id="studio-direction" aria-label="Direction" className={studioInput} rows={5} maxLength={1200} value={value} disabled={disabled || selecting}
      aria-autocomplete="list" aria-controls={query && placement ? `${id}-list` : undefined} aria-activedescendant={query && placement && items[active] ? `${id}-${active}` : undefined}
      onChange={(event) => { onChange(event.target.value); updateCaret(event.target); setError(null); }}
      onSelect={(event) => updateCaret(event.currentTarget)}
      onKeyUp={(event) => updateCaret(event.currentTarget)}
      onKeyDown={(event) => {
        if (!query || !placement) return;
        if (event.key === "Escape") { event.preventDefault(); setDismissed(signature); }
        else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && items.length) {
          event.preventDefault(); setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
        } else if (event.key === "Enter" && items[active]) { event.preventDefault(); void choose(items[active]); }
      }}
      placeholder={kind === "scene" ? "Describe the scene; type @ to add a visual subject..." : "Describe the top-down map; type @ to add a Place..."} />
    <p className="m-0 mt-1 text-xs text-[var(--dim)]">Choose an @ suggestion to add its subject. Removing the name here does not remove the subject.</p>
    {query && placement && createPortal(<div ref={popup} style={{ left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight }} className={`fixed z-[100] overflow-y-auto border border-[var(--line)] bg-[var(--background)] shadow-lg ${placement.above ? "-translate-y-full" : ""}`}>
      <div role="listbox" id={`${id}-list`} aria-label="Visual subject suggestions">
        {items.map((item, index) => {
          const subjectKind = subjectKindBySection[item.type];
          return subjectKind && <div key={`${item.type}:${item.id}`}>
            {(index === 0 || items[index - 1].type !== item.type) && <p className="m-0 px-3 pt-2 text-xs text-[var(--dim)]">{studioKindLabels[subjectKind]}</p>}
            <button id={`${id}-${index}`} role="option" aria-selected={index === active} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void choose(item)}
              className={`flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left text-sm ${index === active ? "bg-[var(--cyan)]/10" : "hover:bg-[var(--panel)]"}`}>
              <span className="min-w-0 break-words">@{item.label}{item.meta && <span className="block text-xs text-[var(--dim)]">{item.meta}</span>}</span>
              <span className={`shrink-0 border px-1 font-mono text-[9px] ${studioKindTones[subjectKind]}`}>{studioKindLabels[subjectKind]}</span>
            </button>
          </div>;
        })}
      </div>
      {loading ? <p role="status" className="p-3 text-xs">Searching subjects...</p> : !items.length && !error && <p className="p-3 text-xs text-[var(--dim)]">No matching visual subjects.</p>}
    </div>, document.body)}
    {selecting && <p role="status" className="text-xs text-[var(--cyan)]">Adding subject...</p>}
    {error && <p role="alert" className="break-words text-xs text-[var(--pink)]">{error}</p>}
  </div>;
}
