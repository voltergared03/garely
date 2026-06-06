import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { requireAuth } from "@/lib/api-auth";
import { getCurrentOrgId } from "@/lib/org";
import { validateBody } from "@/lib/validate";
import { loadDecisionCtx, decisionMutationAllowed, updateDecisionRow, deleteDecisionRow } from "@/lib/decisions";

/**
 * PATCH/DELETE /api/decisions/[id] — curate a single decision (Phase 4.2).
 *
 * Bespoke, mirroring /api/tasks (the generic engine guards 404 system tables).
 * Mutations are gated to admin OR the source meeting's creator
 * (decisionMutationAllowed); the org is pinned from the session so a decision
 * id from another org resolves to 404. PATCH edits the decision text and/or its
 * owner (a single person); DELETE removes the decision Row. Neither touches the
 * meeting report or any task.
 */
const patchSchema = z.object({
  text: z.string().trim().min(1).optional(),
  ownerId: z.string().nullish(), // null/'' clears the owner; a userId sets it
});

async function authorize(id: string, session: { user: { id: string; role?: string | null } }) {
  const orgId = await getCurrentOrgId(session as never);
  const ctx = await loadDecisionCtx(id, orgId);
  if (!ctx) return { error: "not_found" as const, status: 404 as const };
  if (!(await decisionMutationAllowed(ctx.meetingId, session.user.id, session.user.role))) {
    return { error: "forbidden" as const, status: 403 as const };
  }
  return { ctx };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await params;

  const v = await validateBody(req, patchSchema);
  if (!v.ok) return v.response;
  if (v.data.text === undefined && v.data.ownerId === undefined) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const a = await authorize(id, session);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const updated = await updateDecisionRow(a.ctx, { text: v.data.text, ownerId: v.data.ownerId });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await params;

  const a = await authorize(id, session);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  await deleteDecisionRow(id);
  return NextResponse.json({ ok: true });
}
