"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { panelClassName, recordActionButtonClassName, recordDeleteActionClassName } from "@/components/ui/recordStyles";
import { accentIconCyanClassName, eyebrowClassName, liveDotClassName } from "@/components/ui/terminalStyles";

type CredentialStatus = {
  connected: boolean;
  verificationStatus: "verified" | "invalid" | "error" | "disconnected";
  label: string | null;
  limitUsd: number | null;
  remainingUsd: number | null;
  usageUsd: number;
  unlimited: boolean;
  connectedBy: string | null;
  connectedByName: string | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  verificationError: string | null;
  allowPlayerAi: boolean;
  canManage: boolean;
  canUse: boolean;
  ownerSettingsUrl: string | null;
};

type ConnectionAction = "connect" | "refresh" | "reconnect" | "disconnect" | "player";

type CredentialResponse = { credential?: CredentialStatus; authorizationUrl?: string; error?: string };
type CredentialState = { campaignId: string | null; credential: CredentialStatus | null; error: string | null };

const primaryButtonClassName =
  "h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--cyan)] bg-[var(--cyan)] text-[#061017] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background] duration-[200ms] whitespace-nowrap hover:-translate-y-px hover:bg-[#8ceeff] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";
const compactButtonClassName = `${recordActionButtonClassName} h-[34px]`;
const detailLabelClassName = "text-[var(--dim)] font-mono text-[7px] tracking-[.12em]";
const detailValueClassName = "mt-[5px] overflow-wrap-anywhere text-[var(--ink)] text-[11px] leading-[1.35]";

async function fetchCredentialStatus(campaignId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/openrouter`, { cache: "no-store" });
  const result = (await response.json()) as CredentialResponse;
  if (!response.ok || !result.credential) throw new Error(result.error ?? "Campaign OpenRouter status is unavailable.");
  return result.credential;
}

function formatUsd(value: number | null) {
  return value === null ? "NOT REPORTED" : `$${value.toFixed(2)}`;
}

function formatDate(value: string | null) {
  return value ? value.slice(0, 10) : "NOT RECORDED";
}

function actionLabel(action: ConnectionAction) {
  if (action === "connect") return "CONNECTING...";
  if (action === "reconnect") return "RECONNECTING...";
  if (action === "refresh") return "REFRESHING...";
  if (action === "disconnect") return "DISCONNECTING...";
  return "UPDATING...";
}

export default function OpenRouterConnectionSettings({ campaignId }: { campaignId: string }) {
  const [credentialState, setCredentialState] = useState<CredentialState>({ campaignId: null, credential: null, error: null });
  const [pending, setPending] = useState<ConnectionAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCredentialStatus(campaignId)
      .then((result) => {
        if (!cancelled) setCredentialState({ campaignId, credential: result, error: null });
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setCredentialState({ campaignId, credential: null, error: loadError instanceof Error ? loadError.message : "Campaign OpenRouter status is unavailable." });
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const credential = credentialState.campaignId === campaignId ? credentialState.credential : null;
  const isLoading = credentialState.campaignId !== campaignId;
  const error = credentialState.campaignId === campaignId ? credentialState.error : null;

  const runAction = async (action: ConnectionAction, allowPlayerAi?: boolean) => {
    if (!campaignId || pending) return;
    if (action === "disconnect" && !window.confirm("Disconnect the campaign OpenRouter key? Existing generated records will remain, but new AI requests will stop.")) return;

    setPending(action);
  setCredentialState((current) => ({ ...current, campaignId, error: null }));
    setNotice(null);

    try {
      const endpoint = action === "refresh"
        ? `/api/campaigns/${encodeURIComponent(campaignId)}/openrouter/refresh`
        : `/api/campaigns/${encodeURIComponent(campaignId)}/openrouter${action === "connect" || action === "reconnect" ? "/connect" : ""}`;
      const response = await fetch(endpoint, {
        method: action === "player" ? "PATCH" : action === "disconnect" ? "DELETE" : "POST",
        headers: action === "player" ? { "Content-Type": "application/json" } : undefined,
        body: action === "player" ? JSON.stringify({ allowPlayerAi }) : undefined,
      });
      const result = (await response.json()) as CredentialResponse;
      if (!response.ok) throw new Error(result.error ?? "Campaign OpenRouter connection could not be updated.");

      if (action === "connect" || action === "reconnect") {
        if (!result.authorizationUrl) throw new Error("OpenRouter authorization could not be started.");
        window.location.assign(result.authorizationUrl);
        return;
      }

      if (action === "disconnect") {
        setCredentialState({ campaignId, credential: await fetchCredentialStatus(campaignId), error: null });
        setNotice("Campaign OpenRouter key disconnected.");
      } else if (result.credential) {
        setCredentialState({ campaignId, credential: result.credential, error: null });
        setNotice(action === "refresh" ? "Campaign OpenRouter details refreshed." : "Player AI access updated.");
      }
    } catch (actionError: unknown) {
      setCredentialState((current) => ({
        ...current,
        campaignId,
        error: actionError instanceof Error ? actionError.message : "Campaign OpenRouter connection could not be updated.",
      }));
    } finally {
      setPending(null);
    }
  };

  const verified = credential?.verificationStatus === "verified";
  const exhausted = credential?.remainingUsd !== null && credential?.remainingUsd !== undefined && credential.remainingUsd <= 0;
  const statusNeedsAction = credential?.connected && !verified;
  const actionInProgress = pending ? actionLabel(pending) : null;

  return (
    <section className={`${panelClassName} w-full min-w-0`} data-openrouter-connection>
      <div className="panel-topline flex items-start justify-between gap-4 px-[21px] pb-3 pt-5">
        <div>
          <p className={`${eyebrowClassName} !mb-2`}>GM CONTROL // PROVIDER CONNECTION</p>
          <h2>OpenRouter campaign key</h2>
        </div>
        <KeyRound size={17} className={accentIconCyanClassName} />
      </div>
      <div className="grid gap-[6px] border-b border-[var(--line)] px-[21px] pb-4">
        <p className="m-0 text-[var(--muted)] text-[11px] leading-[1.5]">
          Connect one campaign-owned OpenRouter key for this campaign&apos;s AI requests.
        </p>
        <span className="m-0 text-[var(--dim)] font-mono text-[8px] tracking-[.06em] leading-[1.5]">
          Authorization uses OpenRouter OAuth. Star Board never asks for or displays pasted key material.
        </span>
      </div>
      {isLoading ? (
        <p className="flex items-center gap-[7px] m-0 p-[15px_21px] text-[var(--dim)] font-mono text-[8px] tracking-[.06em]">
          <LoaderCircle className="animate-spin" size={13} /> LOADING CONNECTION STATUS...
        </p>
      ) : !credential?.connected ? (
        <div className="grid gap-4 p-[18px_21px_21px]">
          <div className="flex items-start gap-3">
            <Unplug size={18} className="mt-px shrink-0 text-[var(--amber)]" />
            <div className="grid gap-[5px]">
              <strong className="text-[var(--ink)] text-[12px]">NO CAMPAIGN KEY CONNECTED</strong>
              <p className="m-0 text-[var(--muted)] text-[10px] leading-[1.5]">
                Connect an OpenRouter key before changing model access or generating new AI drafts.
              </p>
            </div>
          </div>
          <div>
            <button className={primaryButtonClassName} disabled={pending !== null} onClick={() => void runAction("connect")} type="button">
              {pending === "connect" ? <LoaderCircle className="animate-spin" size={14} /> : <KeyRound size={14} />}
              {pending === "connect" ? actionInProgress : "CONNECT OPENROUTER"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-[21px] py-[13px]">
            <p className="flex items-center gap-[7px] m-0 text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">
              {verified ? <CheckCircle2 className="text-[var(--green)]" size={14} /> : <AlertTriangle className="text-[var(--amber)]" size={14} />}
              {verified ? "VERIFIED CAMPAIGN KEY" : "ACTION REQUIRED // KEY NOT VERIFIED"}
            </p>
            {credential.canManage ? <span className={liveDotClassName} title="You can manage this connection" /> : null}
          </div>
          <div className="grid grid-cols-3 gap-px border-b border-[var(--line)] bg-[var(--line)] max-[760px]:grid-cols-2">
            <div className="min-w-0 bg-[rgba(16,21,30,.84)] p-[13px_16px]">
              <span className={detailLabelClassName}>KEY LABEL</span>
              <strong className={detailValueClassName}>{credential.label ?? "UNNAMED KEY"}</strong>
            </div>
            <div className="min-w-0 bg-[rgba(16,21,30,.84)] p-[13px_16px]">
              <span className={detailLabelClassName}>CONNECTED BY</span>
              <strong className={detailValueClassName}>{credential.connectedByName ?? "CAMPAIGN GM"}</strong>
            </div>
            <div className="min-w-0 bg-[rgba(16,21,30,.84)] p-[13px_16px]">
              <span className={detailLabelClassName}>CONNECTED</span>
              <strong className={detailValueClassName}>{formatDate(credential.connectedAt)}</strong>
            </div>
            <div className="min-w-0 bg-[rgba(16,21,30,.84)] p-[13px_16px]">
              <span className={detailLabelClassName}>LIMIT</span>
              <strong className={detailValueClassName}>{credential.unlimited ? "UNLIMITED" : formatUsd(credential.limitUsd)}</strong>
            </div>
            <div className="min-w-0 bg-[rgba(16,21,30,.84)] p-[13px_16px]">
              <span className={detailLabelClassName}>REMAINING</span>
              <strong className={detailValueClassName}>{credential.unlimited ? "ACCOUNT CONTROLLED" : formatUsd(credential.remainingUsd)}</strong>
            </div>
            <div className="min-w-0 bg-[rgba(16,21,30,.84)] p-[13px_16px]">
              <span className={detailLabelClassName}>USAGE</span>
              <strong className={detailValueClassName}>{formatUsd(credential.usageUsd)}</strong>
            </div>
          </div>
          {statusNeedsAction ? (
            <p className="m-0 border-b border-[var(--line)] px-[21px] py-[12px] text-[var(--amber)] text-[10px] leading-[1.5]" role="alert">
              {credential.verificationError ?? "The campaign key needs to be reconnected before AI requests can continue."}
            </p>
          ) : null}
          {credential.unlimited || exhausted ? (
            <p className="m-0 border-b border-[var(--line)] px-[21px] py-[12px] text-[var(--amber)] text-[10px] leading-[1.5]" role="status">
              {exhausted ? "This key has no reported balance remaining. OpenRouter may reject new requests until its limit changes." : "This key has no campaign spending cap reported by OpenRouter. Monitor usage from the owner controls."}
            </p>
          ) : null}
          <div className="grid gap-3 p-[15px_21px_20px]">
            {credential.canManage ? (
              <label className="flex min-w-0 items-start gap-3 text-[var(--muted)] text-[10px] leading-[1.45]">
                <input
                  aria-label="Allow player character AI assistance"
                  checked={credential.allowPlayerAi}
                  className="mt-px accent-[var(--cyan)]"
                  disabled={!verified || pending !== null}
                  onChange={(event) => void runAction("player", event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong className="block text-[var(--ink)] text-[10px] font-medium">ALLOW PLAYER CHARACTER ASSISTANCE</strong>
                  <small className="block mt-[3px] text-[var(--dim)] text-[9px]">Players may use the existing character-assistance path only when this is enabled.</small>
                </span>
              </label>
            ) : (
              <p className="m-0 text-[var(--dim)] font-mono text-[8px] tracking-[.05em] leading-[1.5]">
                CONNECTION MANAGEMENT IS LIMITED TO {credential.connectedByName ?? "THE CONNECTING GM"} OR THE CAMPAIGN CREATOR.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {credential.canManage ? (
                <>
                  <button className={compactButtonClassName} disabled={pending !== null} onClick={() => void runAction("refresh")} type="button">
                    {pending === "refresh" ? <LoaderCircle className="animate-spin" size={13} /> : <RefreshCw size={13} />}
                    {pending === "refresh" ? actionInProgress : "REFRESH DETAILS"}
                  </button>
                  <button className={compactButtonClassName} disabled={pending !== null} onClick={() => void runAction("reconnect")} type="button">
                    {pending === "reconnect" ? <LoaderCircle className="animate-spin" size={13} /> : <ShieldCheck size={13} />}
                    {pending === "reconnect" ? actionInProgress : "RECONNECT"}
                  </button>
                  <button className={recordDeleteActionClassName} disabled={pending !== null} onClick={() => void runAction("disconnect")} type="button">
                    {pending === "disconnect" ? <LoaderCircle className="animate-spin" size={13} /> : <Unplug size={13} />}
                    {pending === "disconnect" ? actionInProgress : "DISCONNECT"}
                  </button>
                </>
              ) : null}
              {credential.ownerSettingsUrl ? (
                <a className={`${compactButtonClassName} no-underline`} href={credential.ownerSettingsUrl} rel="noreferrer" target="_blank">
                  <ExternalLink size={13} /> OPEN OWNER CONTROLS
                </a>
              ) : null}
            </div>
            <span className="text-[var(--dim)] font-mono text-[8px] tracking-[.05em]">
              LAST VERIFIED: {formatDate(credential.lastVerifiedAt)}
            </span>
          </div>
        </>
      )}
      {notice ? <p className="m-0 border-t border-[var(--line)] px-[21px] py-[11px] text-[var(--green)] text-[10px]" role="status">{notice}</p> : null}
      {error ? <p className="m-0 border-t border-[var(--line)] px-[21px] py-[11px] text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}
    </section>
  );
}
