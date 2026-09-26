import 'server-only';
import { supabaseAdminClient } from '@/libs/supabase/supabase-admin';

export class AuthenticationError extends Error { readonly status=401; readonly code='unauthorized'; constructor(message='Authentication required'){super(message);this.name='AuthenticationError';} }
function bearerToken(request: Request){const a=request.headers.get('authorization');if(!a)return null;const [s,t]=a.split(' ',2);return s?.toLowerCase()==='bearer'&&t?.trim()?t.trim():null;}
export async function requireAuthenticatedUser(request: Request){const token=bearerToken(request);if(!token)throw new AuthenticationError();const {data,error}=await supabaseAdminClient.auth.getUser(token);if(error||!data.user)throw new AuthenticationError('Invalid or expired access token');return data.user;}
