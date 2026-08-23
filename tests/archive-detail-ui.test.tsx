import { renderToStaticMarkup } from "react-dom/server";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import { describe, expect, it } from "vitest";
import ArchiveMasterDetail from "@/components/ui/ArchiveMasterDetail";
import ArchiveRecordShell from "@/components/ui/ArchiveRecordShell";
import ArchiveRelatedList from "@/components/ui/ArchiveRelatedList";

describe("ArchiveMasterDetail", () => {
  it("renders stable selector and preview panels with the selected preview", () => {
    const markup = renderToStaticMarkup(
      <ArchiveMasterDetail
        selectedId="npc-1"
        toolbar={<div data-testid="toolbar">NPC TOOLBAR</div>}
        selectorEyebrow="ARCHIVE"
        selectorTitle="Contacts"
        selectorIcon={<span aria-hidden="true">ICON</span>}
        selector={<button type="button">Rook</button>}
        preview={<div data-testid="selected-preview">Rook preview</div>}
        emptyPreview={<div>Choose a contact.</div>}
      />,
    );

    expect(markup).toContain('data-archive-master-detail="true"');
    expect(markup).toContain('data-archive-selector-panel="true"');
    expect(markup).toContain('data-archive-preview-panel="true"');
    expect(markup).toContain('data-testid="selected-preview"');
    expect(markup).not.toContain("Choose a contact.");
    expect(markup).toContain("max-[760px]:grid-cols-1");
  });

  it("renders the prompt when no record is selected", () => {
    const markup = renderToStaticMarkup(
      <ArchiveMasterDetail
        selectedId={null}
        toolbar={null}
        selectorEyebrow="ARCHIVE"
        selectorTitle="Contacts"
        selectorIcon={<span aria-hidden="true">ICON</span>}
        selector={<button type="button">Rook</button>}
        preview={<div>Rook preview</div>}
        emptyPreview={<div data-testid="empty-preview">Choose a contact.</div>}
      />,
    );

    expect(markup).toContain('data-testid="empty-preview"');
    expect(markup).not.toContain("Rook preview");
  });
});

describe("ArchiveRecordShell", () => {
  it("renders the Place-derived full-record hierarchy and related slot", () => {
    const markup = renderToStaticMarkup(
      <DirtyFormProvider>
        <ArchiveRecordShell
          backHref="/campaigns/campaign-1/places"
          backLabel="BACK TO PLACES"
          eyebrow="STATION RECORD"
          title="North Station"
          titleId="place-record-title"
          metadata={<span>planet</span>}
          actions={<button type="button" aria-label="Edit North Station">EDIT</button>}
          artwork={<div data-testid="artwork">ART</div>}
          body={<div data-testid="body">BODY</div>}
          related={<div data-testid="related">RELATED</div>}
        />
      </DirtyFormProvider>,
    );

    expect(markup).toContain('data-archive-record="true"');
    expect(markup).toContain('aria-labelledby="place-record-title"');
    expect(markup).toContain("BACK TO PLACES");
    expect(markup).toContain('data-testid="artwork"');
    expect(markup).toContain('data-testid="body"');
    expect(markup).toContain('data-testid="related"');
    expect(markup).toContain("min-h-[430px]");
  });
});

describe("ArchiveRelatedList", () => {
  it("renders canonical linked summaries and intentional empty copy", () => {
    const populated = renderToStaticMarkup(
      <DirtyFormProvider>
        <ArchiveRelatedList
          eyebrow="ASSIGNED JOBS"
          title="Jobs"
          emptyMessage="No jobs assigned."
          items={[{ id: "job-1", href: "/campaigns/campaign-1/jobs/job-1", label: "The Relay", meta: "OPEN" }]}
        />
      </DirtyFormProvider>,
    );
    const empty = renderToStaticMarkup(
      <DirtyFormProvider>
        <ArchiveRelatedList eyebrow="ASSIGNED JOBS" title="Jobs" emptyMessage="No jobs assigned." items={[]} />
      </DirtyFormProvider>,
    );

    expect(populated).toContain('href="/campaigns/campaign-1/jobs/job-1"');
    expect(populated).toContain("The Relay");
    expect(empty).toContain("No jobs assigned.");
  });
});