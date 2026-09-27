import { db, owner } from './server';
import { env } from 'cloudflare:workers';

export type Role = 'admin' | 'tester' | 'client';
export type Member = { team_id: string; user_id: string | null; email: string; role: Role };

export async function currentMember(request: Request): Promise<Member | null> {
  const user = owner(request);
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!user || !email) return null;
  let member = await db().prepare('SELECT team_id,user_id,email,role FROM team_members WHERE user_id = ?').bind(user).first<Member>();
  if (member) return member;
  const pending = await db().prepare('SELECT team_id,user_id,email,role FROM team_members WHERE email = ?').bind(email).first<Member>();
  if (pending && !pending.user_id) {
    await db().prepare('UPDATE team_members SET user_id = ? WHERE email = ? AND user_id IS NULL').bind(user,email).run();
    return { ...pending, user_id:user };
  }
  if (pending) return null;
  // Only the configured site owner may initialize the team.
  const adminEmail = (env as unknown as {ASSA_ADMIN_EMAIL?:string}).ASSA_ADMIN_EMAIL?.toLowerCase();
  if (!adminEmail || email !== adminEmail) return null;
  await db().prepare("INSERT INTO team_members (id,team_id,email,user_id,role,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM team_members)").bind(crypto.randomUUID(),user,email,user,'admin',new Date().toISOString()).run();
  member = await db().prepare('SELECT team_id,user_id,email,role FROM team_members WHERE user_id = ?').bind(user).first<Member>();
  return member || null;
}

export function validEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export function label(value: unknown, length = 100): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= length ? text : null;
}

export function eventStatement(teamId: string, projectId: string, actorEmail: string, kind: string, note: string, createdAt = new Date().toISOString()) {
  return db().prepare('INSERT INTO project_events (id,project_id,team_id,actor_email,kind,note,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),projectId,teamId,actorEmail,kind,note,createdAt);
}
