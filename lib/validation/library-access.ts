import { z } from "zod";

export const campaignLibraryDirectoryCursorSchema = z.object({
  displayName: z.string().min(1).max(120),
  userId: z.string().uuid(),
}).strict();
const encodedCursorSchema = z.string().max(1024).transform((value, context) => {
  try { return JSON.parse(value); }
  catch {
    context.addIssue({ code: "custom", message: "Campaign directory cursor is invalid." });
    return z.NEVER;
  }
}).pipe(campaignLibraryDirectoryCursorSchema);

export const campaignLibraryDirectoryQuerySchema = z.object({
  q: z.string().trim().max(160).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: encodedCursorSchema.optional(),
}).strict();
export const campaignLibraryEditorInputSchema = z.object({ canEdit: z.boolean() }).strict();
export const campaignLibraryMemberSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().min(1).max(120),
  campaignRole: z.enum(["gm", "player"]),
  access: z.enum(["owner", "editor", "read-only"]),
  editorGrantedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();
export const campaignLibraryAccessSchema = z.object({
  owner: z.boolean(),
  member: z.boolean(),
  canEdit: z.boolean(),
}).strict();
export const campaignLibraryDirectoryResponseSchema = z.object({
  members: z.array(campaignLibraryMemberSchema).max(50),
  nextCursor: campaignLibraryDirectoryCursorSchema.nullable(),
}).strict();
export const campaignLibraryEditorResponseSchema = z.object({ member: campaignLibraryMemberSchema }).strict();
export type CampaignLibraryMember = z.infer<typeof campaignLibraryMemberSchema>;
export type CampaignLibraryDirectoryPage = z.infer<typeof campaignLibraryDirectoryResponseSchema>;
export type CampaignLibraryDirectoryQuery = z.infer<typeof campaignLibraryDirectoryQuerySchema>;
export type CampaignLibraryAccess = z.infer<typeof campaignLibraryAccessSchema>;
