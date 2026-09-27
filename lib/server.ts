import { env } from 'cloudflare:workers';

export function db(): D1Database {
  if (!env.DB) throw new Error('Assessment storage is unavailable.');
  return env.DB;
}

export function owner(request: Request): string | null {
  const value = request.headers.get('oai-authenticated-user-id');
  if (value) return value;
  // Some authenticated dispatches provide only the verified account email.
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (email) return `email:${email}`;
  return process.env.NODE_ENV === 'development' ? 'local-preview' : null;
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin','none'].includes(site)) return false;
  return !origin || origin === new URL(request.url).origin;
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('Send a JSON request.');
  const raw = await request.text();
  if (raw.length > 4096) throw new Error('Request is too large.');
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid request.');
  return data as Record<string, unknown>;
}
