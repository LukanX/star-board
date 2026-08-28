import { renderToStaticMarkup } from "react-dom/server";
import { UserRound } from "lucide-react";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import { describe, expect, it } from "vitest";
import ArchiveMasterDetail from "@/components/ui/ArchiveMasterDetail";
import ArchivePreviewEmptyState from "@/components/ui/ArchivePreviewEmptyState";
import ArchiveRecordShell from "@/components/ui/ArchiveRecordShell";
import ArchiveRelatedList from "@/components/ui/ArchiveRelatedList";
import { RecordDeleteAction, RecordEditAction } from "@/components/ui/RecordActions";

describe("ArchivePreviewEmptyState", () => {
  it("renders a spacious centered placeholder with forwarded route hooks", () => {
    const markup = renderToStaticMarkup(
      <ArchivePreviewEmptyState
        data-npc-detail="true"
        icon={UserRound}
        eyebrow="ROUTE-OWNED CONTACT FILES"
        title="Choose a contact from the roster."
        message="Select a record to inspect its public brief."
      />,
    );

    expect(markup).toContain('data-archive-preview-empty="true"');
    expect(markup).toContain('data-npc-detail="true"');
    expect(markup).toContain("ROUTE-OWNED CONTACT FILES");
    expect(markup).toContain("Choose a contact from the roster.");
    expect(markup).toContain("min-h-[430px]");
    expect(markup).toContain("place-items-center");
    expect(markup).toContain("max-[760px]:min-h-[360px]");
    expect(markup).toContain("max-w-[340px]");
  });

  it("maps the threat accent to pink", () => {
    const markup = renderToStaticMarkup(
      <ArchivePreviewEmptyState
        accent="pink"
        icon={UserRound}
        eyebrow="ROUTE-OWNED THREAT FILES"
        title="Choose an enemy from the roster."
        message="Select a record to inspect its revealed brief."
      />,
    );

    expect(markup).toContain("text-[var(--pink)]");
    expect(markup).toContain("border-[rgba(255,92,154,.35)]");
  });
});

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

describe("RecordActions", () => {
  it("renders labeled edit and delete actions with shared icon and danger treatments", () => {
    const markup = renderToStaticMarkup(
      <div>
        <RecordEditAction recordName="North Station" />
        <RecordDeleteAction recordName="North Station" />
        <RecordDeleteAction disabled recordName="North Station" />
      </div>,
    );

    expect(markup).toContain("EDIT");
    expect(markup).toContain("DELETE");
    expect(markup).toContain("DELETING...");
    expect(markup).toContain('aria-label="Edit North Station"');
    expect(markup).toContain('aria-label="Delete North Station"');
    expect(markup).toContain("text-[var(--pink)]");
    expect(markup).toContain("disabled");
    expect(markup).toContain("lucide-pencil");
    expect(markup).toContain("lucide-trash-2");
  });
});