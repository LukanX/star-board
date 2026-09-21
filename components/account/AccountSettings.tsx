"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, Mail, Orbit, Radio, ShieldCheck } from "lucide-react";
import Link from "next/link";
import MemberProfileForm from "@/components/members/MemberProfileForm";
import SignOutButton from "@/components/auth/SignOutButton";
import {
  authBrandClassName,
  authBrandNameClassName,
  authBrandSubtitleClassName,
  authBrandSymbolClassName,
  authGridClassName,
  authPanelClassName,
  authShellClassName,
} from "@/components/auth/authStyles";
import { getEmailChangeRedirect } from "@/lib/app-url";
import { campaignPath } from "@/lib/campaign/routes";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { updateAccountProfileSchema } from "@/lib/validation/account";

type CampaignIdentity = {
  id: string;
  name: string;
  displayName: string;
};

type AccountSettingsProps = {
  email: string;
  displayName: string;
  campaign: CampaignIdentity | null;
  emailStatus: "confirmed" | "error" | null;
};

const accountPanelClassName =
  `${authPanelClassName} !w-[min(100%_-_32px,860px)]`;

const accountHeaderBrandClassName = `${authBrandClassName} !border-0 !p-0`;

const accountHeadingClassName =
  "border-b border-[var(--line)] pb-[27px] pt-[37px] [&_h1]:mb-3 [&_h1]:text-[clamp(30px,5vw,43px)] [&_p:last-child]:m-0 [&_p:last-child]:max-w-[570px] [&_p:last-child]:text-[var(--muted)] [&_p:last-child]:text-[12px] [&_p:last-child]:leading-[1.65] max-[520px]:pt-[29px]";

const accountLayoutClassName =
  "grid grid-cols-2 gap-[18px] pt-[25px] max-[700px]:grid-cols-1";

const accountSectionClassName =
  "border-t border-[var(--line)] pt-[15px]";

const accountSectionHeadingClassName =
  "mb-[17px] flex items-center gap-2 text-[var(--dim)] font-mono text-[8px] tracking-[.14em] [&>svg]:text-[var(--cyan)]";

const accountFormClassName =
  "grid gap-[9px] [&_label]:text-[var(--dim)] [&_label]:font-mono [&_label]:text-[8px] [&_label]:tracking-[.14em] [&_input]:h-[44px] [&_input]:w-full [&_input]:border [&_input]:border-[rgba(139,151,169,.28)] [&_input]:bg-[#0a1118] [&_input]:px-[13px] [&_input]:text-[var(--ink)] [&_input]:font-mono [&_input]:text-[12px] [&_input]:outline-0 [&_input:focus]:border-[var(--cyan)] [&_input:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_input::placeholder]:text-[#4d5a6b]";

const accountHelperClassName =
  "m-0 text-[var(--muted)] text-[11px] leading-[1.55]";

const accountActionClassName =
  "mt-2 inline-flex h-[42px] items-center justify-center gap-2 border border-[var(--cyan)] bg-[var(--cyan)] px-[14px] text-[#061017] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap shadow-[0_0_20px_rgba(98,232,255,.16)] hover:-translate-y-px hover:bg-[#8ceeff] disabled:cursor-wait disabled:opacity-60 disabled:transform-none";

const accountStatusClassName =
  "mt-[13px] flex items-start gap-2 border border-[rgba(121,230,173,.3)] bg-[rgba(121,230,173,.06)] p-3 text-[var(--green)] text-[10px] leading-[1.5]";

const accountErrorClassName = "m-0 text-[var(--pink)] text-[10px] leading-[1.5]";

export default function AccountSettings({
  email,
  displayName,
  campaign,
  emailStatus,
}: AccountSettingsProps) {
  const [accountName, setAccountName] = useState(displayName);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameStatus, setNameStatus] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState(email);
  const [isRequestingEmailChange, setIsRequestingEmailChange] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(emailStatus === "error" ? "This email confirmation link could not be completed. Request a new change link." : null);
  const [emailMessage, setEmailMessage] = useState<string | null>(emailStatus === "confirmed" ? "Email address confirmed." : null);

  async function saveAccountName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = updateAccountProfileSchema.safeParse({ displayName: accountName });

    if (!input.success) {
      setNameError("Account name must contain between 1 and 120 characters.");
      setNameStatus(null);
      return;
    }

    setIsSavingName(true);
    setNameError(null);
    setNameStatus(null);

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: input.data.displayName }),
      });
      const result = (await response.json().catch(() => ({}))) as { displayName?: string; error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to save account name.");
      }

      const savedName = result.displayName ?? input.data.displayName;
      setAccountName(savedName);
      setNameStatus("Account name updated.");
    } catch (error: unknown) {
      setNameError(error instanceof Error ? error.message : "Unable to save account name.");
    } finally {
      setIsSavingName(false);
    }
  }

  async function requestEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = accountEmail.trim();

    if (!nextEmail || !nextEmail.includes("@")) {
      setEmailError("Enter a valid email address.");
      setEmailMessage(null);
      return;
    }

    if (nextEmail.toLowerCase() === email.toLowerCase()) {
      setEmailError("Enter a different email address to request a change.");
      setEmailMessage(null);
      return;
    }

    setIsRequestingEmailChange(true);
    setEmailError(null);
    setEmailMessage(null);

    try {
      const { error } = await getSupabaseBrowserClient().auth.updateUser(
        { email: nextEmail },
        { emailRedirectTo: getEmailChangeRedirect(window.location.origin) },
      );

      if (error) {
        throw error;
      }

      setAccountEmail(nextEmail);
      setEmailMessage("Confirmation links sent. Confirm the change from your email before it becomes active.");
    } catch (error: unknown) {
      setEmailError(error instanceof Error ? error.message : "Unable to request an email change.");
    } finally {
      setIsRequestingEmailChange(false);
    }
  }

  return (
    <main className={authShellClassName}>
      <div className={authGridClassName} />
      <section className={accountPanelClassName}>
        <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-[26px] max-[520px]:items-start max-[520px]:flex-col">
          <div className={accountHeaderBrandClassName}><span className={authBrandSymbolClassName}><Orbit size={23} /></span><span><strong className={authBrandNameClassName}>STAR BOARD</strong><small className={authBrandSubtitleClassName}>ACCOUNT CONFIGURATION</small></span></div>
          <SignOutButton className="inline-flex h-[35px] items-center justify-center gap-2 border border-[var(--line)] bg-[rgba(255,255,255,.035)] px-[12px] text-[var(--muted)] font-mono text-[8px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] disabled:cursor-wait disabled:opacity-60" label="SIGN OUT" />
        </header>
        <div className={accountHeadingClassName}><p className="m-[0_0_13px] text-[var(--cyan)] font-mono text-[8px] tracking-[.14em]">ACCOUNT // PROFILE</p><h1>Set your account name.</h1><p>Your account name is global. Each campaign can still give you its own display name.</p></div>
        <div className={accountLayoutClassName}>
          <section className={accountSectionClassName}>
            <div className={accountSectionHeadingClassName}><ShieldCheck size={15} /> DEFAULT ACCOUNT NAME</div>
            <form className={accountFormClassName} onSubmit={saveAccountName}>
              <label htmlFor="account-name">GLOBAL PROFILE NAME</label>
              <input id="account-name" maxLength={120} onChange={(event) => setAccountName(event.target.value)} value={accountName} />
              <p className={accountHelperClassName}>Used as your default identity across Star Board.</p>
              {nameError ? <p className={accountErrorClassName} role="alert">{nameError}</p> : null}
              {nameStatus ? <p className={accountStatusClassName} role="status"><Check size={14} /> {nameStatus}</p> : null}
              <button className={accountActionClassName} disabled={isSavingName} type="submit"><Check size={14} /> {isSavingName ? "SAVING..." : "SAVE ACCOUNT NAME"}</button>
            </form>
          </section>
          <section className={accountSectionClassName}>
            <div className={accountSectionHeadingClassName}><Mail size={15} /> EMAIL ACCESS</div>
            <form className={accountFormClassName} onSubmit={requestEmailChange}>
              <label htmlFor="account-email">ACCOUNT EMAIL</label>
              <input autoComplete="email" id="account-email" onChange={(event) => setAccountEmail(event.target.value)} required type="email" value={accountEmail} />
              <p className={accountHelperClassName}>Changing email requires confirmation from your inbox.</p>
              {emailError ? <p className={accountErrorClassName} role="alert">{emailError}</p> : null}
              {emailMessage ? <p className={accountStatusClassName} role="status"><Check size={14} /> {emailMessage}</p> : null}
              <button className={accountActionClassName} disabled={isRequestingEmailChange} type="submit"><Mail size={14} /> {isRequestingEmailChange ? "REQUESTING..." : "REQUEST EMAIL CHANGE"}</button>
            </form>
          </section>
          {campaign ? (
            <section className={`${accountSectionClassName} col-span-2 max-[700px]:col-span-1`}>
              <div className={accountSectionHeadingClassName}><Radio size={15} /> ACTIVE CAMPAIGN IDENTITY</div>
              <p className={`${accountHelperClassName} mb-[15px]`}><strong className="text-[var(--ink)]">{campaign.name}</strong> uses a separate display name for you. Changing it does not change your global account name.</p>
              <MemberProfileForm campaignId={campaign.id} initialDisplayName={campaign.displayName} onSaved={() => undefined} />
            </section>
          ) : null}
        </div>
        <footer className="mt-[27px] flex items-center justify-between gap-4 border-t border-[var(--line)] pt-[17px] max-[520px]:items-start max-[520px]:flex-col">
          <Link className="inline-flex items-center gap-2 text-[var(--cyan)] font-mono text-[9px] tracking-[.1em] hover:text-[var(--ink)]" href={campaign ? campaignPath(campaign.id) : "/campaigns"}><ArrowLeft size={14} /> {campaign ? "RETURN TO CAMPAIGN" : "RETURN TO CAMPAIGNS"}</Link>
          <span className="inline-flex items-center gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]"><ArrowUpRight size={13} /> ACCOUNT SETTINGS</span>
        </footer>
      </section>
    </main>
  );
}