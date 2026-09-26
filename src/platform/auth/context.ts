import 'server-only';
import { z } from 'zod';
import { requireAuthenticatedUser } from './session';
import { requireWorkspaceAccess,type WorkspaceRole } from './workspace';
const schema=z.string().uuid();
export class WorkspaceContextError extends Error {readonly status=400;readonly code='workspace_required';constructor(message='A valid x-workspace-id header is required'){super(message);this.name='WorkspaceContextError';}}
export async function requireWorkspaceContext(request:Request,roles?:readonly WorkspaceRole[]){const id=schema.safeParse(request.headers.get('x-workspace-id'));if(!id.success)throw new WorkspaceContextError();const user=await requireAuthenticatedUser(request);const membership=await requireWorkspaceAccess(user.id,id.data,roles);return {user,workspaceId:membership.workspaceId,role:membership.role};}
