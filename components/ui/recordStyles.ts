export const recordListClassName = "border border-[var(--line)] bg-[var(--panel)]";
export const panelClassName =
  "border border-[var(--line)] bg-[rgba(16,21,30,.84)]";

export const archivePreviewArtworkClassName =
  "relative min-w-0 w-[min(100%,320px)] aspect-square overflow-hidden";

export const archiveDetailArtworkClassName =
  "relative min-w-0 w-[480px] max-w-full h-full aspect-square overflow-hidden max-[760px]:w-full max-[760px]:min-w-0 max-[760px]:h-auto max-[760px]:justify-self-start";

export const recordRowClassName =
  "flex min-h-[86px] items-center gap-[15px] border-b border-[var(--line)] px-[18px] py-[15px] last:border-b-0";

export const recordMainClassName =
  "min-w-0 flex-1 [&_p]:m-[6px_0] [&_p]:text-[var(--muted)] [&_p]:text-[10px]";

export const recordTitleRowClassName =
  "flex items-center gap-[10px] [&>h3]:m-0 [&>h3]:text-[13px]";

export const recordMetaClassName =
  "flex items-center gap-[5px] text-[var(--dim)] font-mono text-[8px]";

export const recordVisibilityClassName =
  "flex min-w-[123px] flex-col items-start gap-2 text-[var(--dim)] font-mono text-[9px] tracking-[.11em] max-[760px]:hidden [&>span]:inline-flex [&>span]:items-center [&>span]:gap-[5px] [&>span]:text-[7px]";

export const recordDetailClassName =
  "mt-[18px] grid gap-3 border border-[rgba(98,232,255,.24)] bg-[rgba(98,232,255,.04)] p-5 [&_h2]:mb-[6px] [&>p]:m-0 [&>p]:text-[var(--muted)] [&>p]:text-[11px] [&>p]:leading-[1.6]";

export const recordDetailMetaClassName =
  "!font-mono !text-[8px] !text-[var(--cyan)] tracking-[.1em]";

export const recordRowActionsClassName =
  "ml-auto flex items-center gap-[2px]";

export const recordActionButtonClassName =
  "h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] bg-[rgba(255,255,255,.035)] text-[var(--muted)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";

export const recordDeleteActionClassName =
  `${recordActionButtonClassName} !border-[rgba(255,92,154,.42)] bg-[rgba(255,92,154,.08)] !text-[var(--pink)] hover:!border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)]`;