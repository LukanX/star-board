export const authShellClassName =
  "relative grid min-h-screen place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_8%,rgba(98,232,255,.12),transparent_29%),radial-gradient(circle_at_82%_88%,rgba(255,92,154,.08),transparent_28%),#080b11] text-[var(--ink)] before:absolute before:inset-0 before:pointer-events-none before:content-[''] before:opacity-30 before:bg-[linear-gradient(rgba(98,232,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(98,232,255,.06)_1px,transparent_1px)] before:bg-[length:46px_46px] before:[mask-image:linear-gradient(180deg,black,transparent_90%)]";

export const authGridClassName =
  "absolute inset-[9%] border border-[rgba(98,232,255,.11)] opacity-[.45] [transform:perspective(500px)_rotateX(58deg)] [transform-origin:center_bottom] bg-[linear-gradient(rgba(98,232,255,.1)_1px,transparent_1px),linear-gradient(90deg,rgba(98,232,255,.1)_1px,transparent_1px)] bg-[length:58px_58px] max-[520px]:inset-[5%_-20%]";

export const authSignalClassName =
  "absolute h-px w-[42vw] max-w-[620px] -rotate-[27deg] bg-[linear-gradient(90deg,transparent,var(--cyan),transparent)] opacity-[.55] shadow-[0_0_18px_rgba(98,232,255,.7)] max-[520px]:w-[80vw]";

export const authSignalOneClassName = "top-[24%] left-[-7%]";

export const authSignalTwoClassName =
  "right-[-8%] bottom-[21%] rotate-[27deg] bg-[linear-gradient(90deg,transparent,var(--pink),transparent)] shadow-[0_0_18px_rgba(255,92,154,.7)]";

export const authPanelClassName =
  "relative z-[1] w-[min(100%_-_32px,470px)] border border-[rgba(98,232,255,.27)] bg-[rgba(12,17,25,.9)] p-[31px] shadow-[0_24px_80px_rgba(0,0,0,.4),0_0_34px_rgba(98,232,255,.06)] before:absolute before:-top-px before:-left-px before:h-[9px] before:w-[9px] before:border-l before:border-t before:border-[var(--cyan)] before:content-[''] after:absolute after:-right-px after:-bottom-px after:h-[9px] after:w-[9px] after:border-r after:border-b after:border-[var(--cyan)] after:content-[''] max-[520px]:p-[23px_19px]";

export const authPromptPanelClassName = "!w-[min(100%_-_32px,520px)]";

export const authBrandClassName =
  "flex items-center gap-[11px] border-b border-[var(--line)] pb-[26px]";

export const authBrandSymbolClassName =
  "grid h-[35px] w-[35px] rotate-[30deg] place-items-center border border-[rgba(98,232,255,.65)] text-[var(--cyan)] shadow-[0_0_19px_rgba(98,232,255,.14),inset_0_0_12px_rgba(98,232,255,.12)] [&_svg]:rotate-[-30deg]";

export const authBrandNameClassName =
  "block text-[var(--ink)] text-[13px] tracking-[.16em]";

export const authBrandSubtitleClassName =
  "mt-1 block text-[var(--dim)] font-mono text-[7px] tracking-[.14em]";

export const authHeadingClassName =
  "pt-[37px] pb-7 [&>p:first-child]:mb-[13px] [&_h1]:mb-3 [&_h1]:text-[clamp(32px,6vw,44px)] [&_p:last-child]:m-0 [&_p:last-child]:max-w-[360px] [&_p:last-child]:text-[var(--muted)] [&_p:last-child]:text-[12px] [&_p:last-child]:leading-[1.65] max-[520px]:pt-[29px]";

export const authFormClassName =
  "grid gap-[9px] [&_label]:text-[var(--dim)] [&_label]:font-mono [&_label]:text-[8px] [&_label]:tracking-[.14em] [&_input]:h-[44px] [&_input]:w-full [&_input]:border [&_input]:border-[rgba(139,151,169,.28)] [&_input]:bg-[#0a1118] [&_input]:px-[13px] [&_input]:text-[var(--ink)] [&_input]:font-mono [&_input]:text-[12px] [&_input]:outline-0 [&_input:focus]:border-[var(--cyan)] [&_input:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_input::placeholder]:text-[#4d5a6b]";

export const authSubmitClassName =
  "mt-2 inline-flex h-[44px] w-full items-center justify-center gap-2 border border-[var(--cyan)] bg-[var(--cyan)] px-[14px] text-[#061017] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap shadow-[0_0_20px_rgba(98,232,255,.16)] hover:-translate-y-px hover:bg-[#8ceeff] disabled:cursor-wait disabled:opacity-60 disabled:transform-none";

export const authSecondaryActionClassName =
  "mt-2 inline-flex h-[44px] w-full items-center justify-center gap-2 border border-[var(--line)] bg-[rgba(255,255,255,.035)] px-[14px] text-[var(--muted)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]";

export const authStatusClassName =
  "mt-[19px] flex items-start gap-[9px] border border-[rgba(121,230,173,.3)] bg-[rgba(121,230,173,.06)] p-3 text-[var(--green)] text-[11px] leading-[1.5]";

export const authFooterClassName =
  "mt-[29px] flex justify-between gap-[14px] border-t border-[var(--line)] pt-[15px] text-[var(--dim)] font-mono text-[7px] tracking-[.1em] max-[520px]:flex-col max-[520px]:items-start";

export const authFooterItemClassName =
  "inline-flex items-center gap-[6px]";

export const authModeToggleClassName =
  "cursor-pointer border-0 bg-transparent p-0 text-right text-[var(--cyan)] font-inherit tracking-[.1em] hover:text-[var(--ink)]";

export const authResetActionClassName =
  "mt-[13px] inline-flex items-center gap-[6px] border-0 bg-transparent p-0 text-[var(--cyan)] font-mono text-[9px] tracking-[.1em] cursor-pointer hover:text-[var(--ink)]";

export const authPromptActionsClassName =
  "mt-6 grid gap-[10px] [&_a]:w-full [&_a]:no-underline";

export const joinHeadingClassName = "pb-[25px]";

export const joinSubmitClassName = "!mt-0";