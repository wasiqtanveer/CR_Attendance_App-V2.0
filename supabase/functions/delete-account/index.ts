// Deploy with JWT verification enabled. Only the authenticated caller is deleted.
const baseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const allowedOrigin = Deno.env.get('APP_ORIGIN');

function response(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin || '',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (!baseUrl || !serviceKey || !allowedOrigin) return response({ error: 'Server configuration is incomplete.' }, 500, allowedOrigin);
  if (origin !== allowedOrigin) return response({ error: 'Origin denied.' }, 403, allowedOrigin);
  if (request.method === 'OPTIONS') return response({}, 200, allowedOrigin);
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405, allowedOrigin);

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return response({ error: 'Sign in required.' }, 401, allowedOrigin);

  // Ask Auth to validate the caller's JWT. Never trust a user id from the body.
  const userResponse = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: { authorization, apikey: serviceKey },
  });
  if (!userResponse.ok) return response({ error: 'Session expired. Sign in again.' }, 401, allowedOrigin);
  const user = await userResponse.json();
  if (!user?.id) return response({ error: 'Could not identify account.' }, 401, allowedOrigin);

  const deleteResponse = await fetch(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
  });
  if (!deleteResponse.ok) return response({ error: 'Could not delete account.' }, 500, allowedOrigin);
  return response({ deleted: true }, 200, allowedOrigin);
});
