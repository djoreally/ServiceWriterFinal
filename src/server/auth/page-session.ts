import 'server-only';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { workspaceMembers, workspaces } from '@/db/schema';
import { supabaseAdminClient } from '@/libs/supabase/supabase-admin';

export async function getOptionalPageUser() {
  const requestHeaders = headers();
  const cookieStore = cookies();
  const accessToken =
    requestHeaders.get('x-sw-access-token') ??
    cookieStore.get('sw_access_token')?.value ??
    null;

  if (!accessToken) return null;

  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}

export async function requirePageUser() {
  const user = await getOptionalPageUser();
  if (!user) redirect('/login');
  return user;
}

export async function listPageWorkspaces(userId: string) {
  return getDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      role: workspaceMembers.role,
      kind: workspaces.kind,
      timezone: workspaces.timezone,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.isActive, true),
      eq(workspaces.isActive, true),
    ))
    .orderBy(asc(workspaces.name));
}

export async function requirePageWorkspace(userId: string, workspaceId: string) {
  const memberships = await listPageWorkspaces(userId);
  const workspace = memberships.find((candidate) => candidate.id === workspaceId);
  if (!workspace) redirect('/dashboard');
  return { workspace, memberships };
}
