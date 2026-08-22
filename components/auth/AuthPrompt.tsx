import Link from "next/link";
import { ArrowUpRight, Orbit, Radio, UserRound } from "lucide-react";
import {
  authBrandClassName,
  authBrandNameClassName,
  authBrandSubtitleClassName,
  authBrandSymbolClassName,
  authFooterClassName,
  authFooterItemClassName,
  authGridClassName,
  authHeadingClassName,
  authPanelClassName,
  authPromptActionsClassName,
  authPromptPanelClassName,
  authSecondaryActionClassName,
  authShellClassName,
  authSignalClassName,
  authSignalOneClassName,
  authSignalTwoClassName,
  authSubmitClassName,
} from "@/components/auth/authStyles";

type AuthPromptProps = {
  nextPath?: string;
};

export default function AuthPrompt({ nextPath = "/campaigns" }: AuthPromptProps) {
  const encodedNextPath = encodeURIComponent(nextPath);

  return (
    <main className={authShellClassName}>
      <div className={authGridClassName} />
      <div className={`${authSignalClassName} ${authSignalOneClassName}`} />
      <div className={`${authSignalClassName} ${authSignalTwoClassName}`} />
      <section className={`${authPanelClassName} ${authPromptPanelClassName}`}>
        <div className={authBrandClassName}><span className={authBrandSymbolClassName}><Orbit size={23} /></span><span><strong className={authBrandNameClassName}>STAR BOARD</strong><small className={authBrandSubtitleClassName}>CAMPAIGN OPERATIONS</small></span></div>
        <div className={authHeadingClassName}><p className="eyebrow eyebrow-bright"><span className="live-dot" /> CAMPAIGN CONSOLE</p><h1>Open your campaign console.</h1><p>Sign in to continue to an existing campaign, or create an account to start a new one.</p></div>
        <div className={authPromptActionsClassName}>
          <Link className={authSubmitClassName} href={`/login?mode=signin&next=${encodedNextPath}`}><Radio size={16} /> SIGN IN <ArrowUpRight size={15} /></Link>
          <Link className={authSecondaryActionClassName} href={`/login?mode=create&next=${encodedNextPath}`}><UserRound size={16} /> CREATE ACCOUNT <ArrowUpRight size={15} /></Link>
        </div>
        <div className={authFooterClassName}><span className={authFooterItemClassName}><Orbit size={13} /> STARFINDER 2E CAMPAIGNS</span><span>AUTHENTICATION REQUIRED</span></div>
      </section>
    </main>
  );
}
