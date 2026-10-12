import { NextRequest } from "next/server";

export interface RequestIdentity { userId: string; organizationId: string }

export async function requireUser(request: NextRequest): Promise<RequestIdentity> {
  // Replace this body with your existing authenticated server-session helper.
  // Never accept these headers from an untrusted public client in production.
  const userId = request.headers.get("x-user-id");
  const organizationId = request.headers.get("x-organization-id");
  if (!userId || !organizationId) throw new Error("UNAUTHORIZED");
  return { userId, organizationId };
}

export function assertClientOwnership(
  client: { organization_id: string } | null,
  organizationId: string,
) {
  if (!client || client.organization_id !== organizationId) throw new Error("FORBIDDEN");
}

