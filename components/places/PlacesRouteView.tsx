"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, CirclePlus, Map } from "lucide-react";
import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import PageLayout from "@/components/ui/PageLayout";
import PlaceCard from "@/components/places/PlaceCard";
import PlaceEditor from "@/components/places/PlaceEditor";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { ApiPlace } from "@/lib/campaign/types";
import { buildPlaceTree, getPlaceBreadcrumb } from "@/lib/places";
import { panelClassName } from "@/components/ui/recordStyles";

type EditorState = { place?: ApiPlace; parentPlaceId: string | null };

export default function PlacesRouteView({
  campaignId,
  role,
  initialPlaces,
}: {
  campaignId: string;
  role: "gm" | "player";
  initialPlaces: ApiPlace[];
}) {
  const [places, setPlaces] = useState(initialPlaces);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () =>
      new Set(
        initialPlaces
          .filter((place) => place.parent_place_id)
          .map((place) => place.parent_place_id!),
      ),
  );
  const [search, setSearch] = useState("");
  const isGM = role === "gm";
  const placeTree = useMemo(() => buildPlaceTree(places), [places]);
  const normalizedSearch = search.trim().toLowerCase();
  const visiblePlaces = normalizedSearch
    ? places.filter((place) =>
        `${place.name} ${place.kind} ${getPlaceBreadcrumb(places, place.id)}`
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : places;
  const visiblePlaceIds = new Set(visiblePlaces.map((place) => place.id));

  const openEditor = (
    place?: ApiPlace,
    parentPlaceId: string | null = null,
  ) => {
    if (!isGM) return;
    setEditorState({ place, parentPlaceId });
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const savePlace = (savedPlace: ApiPlace) => {
    setPlaces((current) =>
      editorState?.place
        ? current.map((place) =>
            place.id === savedPlace.id ? savedPlace : place,
          )
        : [...current, savedPlace],
    );
    setEditorState(null);
  };

  const deletePlace = (deletedPlaceId: string) => {
    setPlaces((current) =>
      current
        .filter((place) => place.id !== deletedPlaceId)
        .map((place) =>
          place.parent_place_id === deletedPlaceId
            ? { ...place, parent_place_id: null }
            : place,
        ),
    );
    setEditorState(null);
  };

  return (
    <PageLayout
      eyebrow="ARCHIVE // PLACE ATLAS"
      title="Places"
      description="A genre-neutral atlas for worlds, regions, sites, and the spaces between them."
      action={isGM ? "ADD ROOT PLACE" : undefined}
      actionIcon={<CirclePlus size={16} />}
      onAction={() => openEditor()}
    >
      {editorState ? (
        <PlaceEditor
          key={`${editorState.place?.id ?? "new"}:${editorState.parentPlaceId ?? "root"}`}
          campaignId={campaignId}
          places={places}
          place={editorState.place}
          parentPlaceId={editorState.parentPlaceId}
          onCancel={() => setEditorState(null)}
          onSaved={savePlace}
          onDeleted={deletePlace}
        />
      ) : null}
      <div
        data-places-toolbar="true"
        className="flex items-end justify-between gap-[20px] mb-[18px] pb-[13px] p-[15px_17px] border border-[var(--line)] bg-[linear-gradient(105deg,rgba(98,232,255,.055),rgba(255,92,154,.025))] max-[760px]:items-stretch max-[760px]:flex-col max-[760px]:gap-[15px] max-[760px]:p-[14px] max-[420px]:p-[12px]"
      >
        <div
          data-places-toolbar-heading="true"
          className="grid gap-[7px]"
        >
          <p className="eyebrow m-0">
            {places.length.toString().padStart(2, "0")} RECORDED PLACES
          </p>
          <strong className="text-[var(--ink)] text-[13px] font-[550]">
            {places.length ? "Campaign geography" : "No place records yet"}
          </strong>
        </div>
        <label
          data-places-search="true"
          className="grid gap-[7px] w-[min(100%,330px)] text-[var(--dim)] font-mono text-[8px] tracking-[.12em] max-[760px]:w-full"
        >
          SEARCH PLACES
          <input
            className="w-full h-[36px] border border-[rgba(139,151,169,.28)] outline-0 p-[0_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] focus:border-[var(--cyan)] focus:shadow-[0_0_0_2px_rgba(98,232,255,.1)] placeholder:text-[#4d5a6b]"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, kind, or breadcrumb"
          />
        </label>
      </div>
      {places.length ? (
        <div
          data-places-layout="true"
          className="grid grid-cols-[minmax(260px,.78fr)_minmax(0,1.22fr)] gap-[14px] items-start max-[760px]:grid-cols-1"
        >
          <section
            data-places-tree-panel="true"
            className={`${panelClassName} min-w-0 overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,.12)] max-[760px]:order-[1]`}
          >
            <div className="panel-topline flex items-start justify-between border-b border-[var(--line)] px-[21px] pb-4 pt-5">
              <div>
                <p className="eyebrow mb-2">PLACE TREE</p>
                <h2>Atlas structure</h2>
              </div>
              <Map className="accent-icon-cyan" size={17} />
            </div>
            {normalizedSearch ? (
              <div
                data-place-search-results="true"
                className="grid gap-[1px] p-[10px]"
              >
                {visiblePlaces.length ? (
                  visiblePlaces.map((place) => (
                    <Link
                      data-place-search-result="true"
                      className="flex items-center justify-between gap-[12px] min-w-0 p-[11px_10px] border border-transparent bg-[rgba(255,255,255,.018)] text-[var(--ink)] text-left cursor-pointer hover:border-[rgba(98,232,255,.3)] hover:bg-[rgba(98,232,255,.06)]"
                      href={campaignEntityPath(campaignId, "places", place.id)}
                      key={place.id}
                    >
                      <span className="min-w-0 grid gap-[4px]">
                        <strong className="overflow-hidden text-[11px] font-[550] text-ellipsis whitespace-nowrap [overflow-wrap:anywhere]">
                          {place.name}
                        </strong>
                        <small className="overflow-hidden text-[var(--dim)] font-mono text-[8px] text-ellipsis whitespace-nowrap">
                          {getPlaceBreadcrumb(places, place.id)}
                        </small>
                      </span>
                      <ArrowUpRight
                        className="flex-[0_0_auto] text-[var(--cyan)]"
                        size={14}
                      />
                    </Link>
                  ))
                ) : (
                  <EmptyState
                    icon={Map}
                    title="No matching places."
                    message="Try a different name, kind, or breadcrumb."
                  />
                )}
              </div>
            ) : (
              <div
                data-place-tree="true"
                className="p-[9px_10px_12px] max-[420px]:px-[6px]"
              >
                {placeTree.map((node) => (
                  <PlaceCard
                    key={node.id}
                    campaignId={campaignId}
                    node={node}
                    expandedIds={expandedIds}
                    onToggle={toggleExpanded}
                    onAddChild={(parentId) =>
                      openEditor(undefined, parentId)
                    }
                    isGM={isGM}
                    visiblePlaceIds={visiblePlaceIds}
                  />
                ))}
              </div>
            )}
          </section>
          <section
            data-places-detail-panel="true"
            className={`${panelClassName} min-w-0 overflow-hidden min-h-[430px] shadow-[0_12px_30px_rgba(0,0,0,.12)] max-[760px]:min-h-0 max-[760px]:order-[-1]`}
          >
            <div
              data-places-detail="true"
              className="min-w-0 p-[21px] max-[760px]:p-[17px]"
            >
              <Map className="accent-icon-cyan" size={24} />
              <p className="eyebrow">ROUTE-OWNED PLACE FILES</p>
              <h2>Choose a place from the atlas.</h2>
              <p>
                Open a record to inspect its public brief, notes, breadcrumb,
                and GM-only context where available.
              </p>
            </div>
          </section>
        </div>
      ) : (
        <EmptyState
          icon={Map}
          title="No places recorded yet."
          message={
            isGM
              ? "Add a root place to start building the campaign atlas."
              : "The GM has not recorded any places yet."
          }
        />
      )}
    </PageLayout>
  );
}
