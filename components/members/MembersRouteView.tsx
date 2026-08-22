"use client";

import { useState } from "react";
import {
  CirclePlus,
  Copy,
  Send,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import MemberCard from "@/components/members/MemberCard";
import MemberProfileForm from "@/components/members/MemberProfileForm";
import EmptyState from "@/components/ui/EmptyState";
import PageLayout from "@/components/ui/PageLayout";
import { recordDetailClassName, recordDetailMetaClassName } from "@/components/ui/recordStyles";
import type { ApiCampaignMember } from "@/lib/campaign/types";

type MemberRole = ApiCampaignMember["role"];

export default function MembersRouteView({
  campaignId,
  currentUserId,
  role,
  displayName,
  initialMembers,
}: {
  campaignId: string;
  currentUserId: string;
  role: MemberRole;
  displayName: string;
  initialMembers: ApiCampaignMember[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [selectedMember, setSelectedMember] =
    useState<ApiCampaignMember | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const isGM = role === "gm";

  async function createJoinLink() {
    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/join-links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxUses: 1, expiresAt: null }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        joinUrl?: string;
      };

      if (!response.ok || !result.joinUrl)
        throw new Error(result.error ?? "Unable to create join link.");

      setJoinUrl(result.joinUrl);
      setStatus("New player join link created.");
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create join link.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function copyJoinLink() {
    if (!joinUrl) return;

    try {
      await navigator.clipboard.writeText(joinUrl);
      setStatus("Join link copied to clipboard.");
    } catch {
      setStatus(joinUrl);
    }
  }

  async function updateMemberRole(nextRole: MemberRole) {
    if (!selectedMember) return;

    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/members/${encodeURIComponent(selectedMember.userId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: nextRole }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        member?: ApiCampaignMember;
      };

      if (!response.ok || !result.member)
        throw new Error(result.error ?? "Unable to update campaign member.");

      setMembers((current) =>
        current.map((member) =>
          member.userId === result.member!.userId ? result.member! : member,
        ),
      );
      setSelectedMember(result.member);
      setStatus(
        `${result.member.displayName} is now ${nextRole === "gm" ? "a GM" : "a player"}.`,
      );
    } catch (updateError: unknown) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update campaign member.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeMember() {
    if (
      !selectedMember ||
      !window.confirm(
        `Remove ${selectedMember.displayName} from this campaign?`,
      )
    )
      return;

    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/members/${encodeURIComponent(selectedMember.userId)}`,
        { method: "DELETE" },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok)
        throw new Error(result.error ?? "Unable to remove campaign member.");

      setMembers((current) =>
        current.filter((member) => member.userId !== selectedMember.userId),
      );
      setSelectedMember(null);
      setStatus(`${selectedMember.displayName} removed from the campaign.`);
    } catch (removeError: unknown) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove campaign member.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PageLayout
      eyebrow="CAMPAIGN ADMIN // MEMBERS"
      title="Crew access"
      description="Manage who can see the campaign and who is trusted to shape it."
      action={isGM ? "CREATE JOIN LINK" : undefined}
      actionIcon={<CirclePlus size={16} />}
      onAction={createJoinLink}
    >
      <div
        data-member-summary="true"
        className="grid grid-cols-2 gap-6 items-start mt-0 mb-5 p-[26px] border border-[var(--line)] bg-[linear-gradient(105deg,rgba(98,232,255,.05),rgba(255,92,154,.025))] max-[760px]:grid-cols-1 max-[760px]:p-[18px]"
      >
        <div>
          <p className="eyebrow">ACCESS MODEL</p>
          <h2 className="max-w-[360px] mb-[10px] text-[22px]">
            One campaign. Two levels of clearance.
          </h2>
          <p className="max-w-[450px] m-0 text-[var(--muted)] text-[11px] leading-[1.65]">
            Player-visible content is shared by default. GM notes, mission
            controls, and campaign administration stay behind the command lock.
          </p>
        </div>
        <div>
          <div
            data-member-clearance="true"
            className="flex flex-col gap-[11px] py-[6px] text-[var(--dim)] font-mono text-[9px] tracking-[.11em]"
          >
            <span className="inline-flex items-center gap-[7px]">
              <i className="legend-dot dot-cyan" /> PLAYER VISIBLE
            </span>
            <span className="inline-flex items-center gap-[7px]">
              <i className="legend-dot dot-pink" /> GM ONLY
            </span>
          </div>
          <MemberProfileForm
            campaignId={campaignId}
            initialDisplayName={displayName}
            onSaved={() => setStatus("Your campaign display name is live.")}
          />
        </div>
      </div>
      {error ? (
        <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className={recordDetailMetaClassName} role="status">
          {status}
        </p>
      ) : null}
      {members.length ? (
        <div
          data-members-list="true"
          className="border border-[var(--line)] bg-[var(--panel)]"
        >
          {members.map((member, index) => (
            <MemberCard
              currentUserId={currentUserId}
              index={index}
              isGM={isGM}
              key={member.userId}
              member={member}
              onSelect={(nextMember) => {
                setSelectedMember(nextMember);
                setError(null);
                setStatus(null);
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={UsersRound}
          title="No campaign members yet."
          message="Invite a player to establish the crew manifest."
        />
      )}
      {selectedMember ? (
        <section className={recordDetailClassName}>
          <div className="editor-heading flex items-start justify-between gap-4 mb-[18px]">
            <div>
              <p className="eyebrow">
                MEMBER ACCESS // {selectedMember.role.toUpperCase()}
              </p>
              <h2 className="mt-[6px] text-[19px]">
                {selectedMember.displayName}
              </h2>
              <p className={recordDetailMetaClassName}>
                Joined {new Date(selectedMember.joinedAt).toLocaleDateString()}
              </p>
            </div>
            <button
              aria-label="Close member details"
              className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
              onClick={() => setSelectedMember(null)}
              title="Close member details"
              type="button"
            >
              <X size={17} />
            </button>
          </div>
          <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap">
            <button
              className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]"
              disabled={isSaving || selectedMember.role === "gm"}
              onClick={() => void updateMemberRole("gm")}
              type="button"
            >
              <ShieldCheck size={14} /> MAKE GM
            </button>
            <button
              className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]"
              disabled={isSaving || selectedMember.role === "player"}
              onClick={() => void updateMemberRole("player")}
              type="button"
            >
              MAKE PLAYER
            </button>
            <button
              className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[rgba(255,92,154,.42)] bg-[rgba(255,92,154,.08)] !text-[var(--pink)] hover:!border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)]"
              disabled={isSaving}
              onClick={() => void removeMember()}
              type="button"
            >
              REMOVE
            </button>
          </div>
        </section>
      ) : null}
      {joinUrl ? (
        <div
          data-member-join-link="true"
          className="flex items-center gap-[14px] mt-[20px] p-[18px] border border-[rgba(98,232,255,.24)] bg-[rgba(98,232,255,.05)] max-[760px]:items-start max-[760px]:flex-wrap"
        >
          <div
            data-member-join-link-icon="true"
            className="w-[39px] h-[39px] grid place-items-center flex-[0_0_39px] text-[var(--cyan)] border border-[rgba(98,232,255,.4)] bg-[rgba(98,232,255,.1)]"
          >
            <Send size={18} />
          </div>
          <div>
            <p className="eyebrow">PLAYER JOIN LINK</p>
            <h3 className="m-0 mb-[7px] text-[var(--cyan)] font-mono text-[12px] font-[500] [overflow-wrap:anywhere] max-[760px]:text-[10px]">
              {joinUrl}
            </h3>
            <p className="m-0 text-[var(--muted)] text-[10px] leading-[1.5]">
              One use - no expiration
            </p>
          </div>
          <button
            className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] ml-auto max-[760px]:ml-[55px]"
            disabled={isSaving}
            onClick={() => void copyJoinLink()}
            type="button"
          >
            <Copy size={14} /> COPY LINK
          </button>
        </div>
      ) : null}
    </PageLayout>
  );
}
