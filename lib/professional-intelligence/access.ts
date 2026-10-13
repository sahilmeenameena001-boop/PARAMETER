import type { Claim, Member, Role, Visibility } from "@/types/professional-intelligence";

const RANK: Record<Role, number> = { viewer: 0, editor: 1, legal_reviewer: 2, admin: 3 };

export function hasRole(member: Pick<Member, "role"> | null | undefined, minimum: Role) {
  return !!member && RANK[member.role] >= RANK[minimum];
}

export const canEdit = (m: Pick<Member, "role"> | null | undefined) => hasRole(m, "editor");
// Verifying sources/claims, reviewing outcomes and approving content are reviewer actions.
export const canReview = (m: Pick<Member, "role"> | null | undefined) => hasRole(m, "legal_reviewer");

export function canSeeVisibility(member: Pick<Member, "role"> | null | undefined, visibility: Visibility) {
  if (visibility === "public") return true;
  if (visibility === "internal") return hasRole(member, "viewer");
  return hasRole(member, "legal_reviewer");
}

/** Personal contact data: phone/email channels and office addresses. Restricted by default. */
export const isContactField = (field: Claim["field"]) => field === "contact" || field === "office_address";

/** Contact values are redacted unless the member may see them. The claim still shows that a sourced channel exists. */
export function redactClaim(claim: Claim, member: Pick<Member, "role"> | null | undefined): Claim & { redacted: boolean } {
  if (!isContactField(claim.field) || canSeeVisibility(member, claim.visibility)) return { ...claim, redacted: false };
  return { ...claim, value: "Restricted — reviewer access required", redacted: true };
}
