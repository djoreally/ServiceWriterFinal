import 'server-only';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { workspaceMembers, workspaces } from '@/db/schema';
export type WorkspaceRole=typeof workspaceMembers.$inferSelect.role;
export class WorkspaceAuthorizationError extends Error {readonly status=403;readonly code='forbidden';constructor(message:string){super(message);this.name='WorkspaceAuthorizationError';}}
export async function requireWorkspaceAccess(userId:string,workspaceId:string,roles?:readonly WorkspaceRole[]){const [m]=await getDb().select({workspaceId:workspaceMembers.workspaceId,userId:workspaceMembers.userId,role:workspaceMembers.role,isActive:workspaceMembers.isActive,workspaceActive:workspaces.isActive}).from(workspaceMembers).innerJoin(workspaces,eq(workspaces.id,workspaceMembers.workspaceId)).where(and(eq(workspaceMembers.workspaceId,workspaceId),eq(workspaceMembers.userId,userId),eq(workspaceMembers.isActive,true),eq(workspaces.isActive,true))).limit(1);if(!m)throw new WorkspaceAuthorizationError('You do not have access to this workspace');if(roles&&!roles.includes(m.role))throw new WorkspaceAuthorizationError('Insufficient workspace permissions');return m;}
