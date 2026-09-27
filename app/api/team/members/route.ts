import { db, sameOrigin, json, body } from '../../../../lib/server';
import { currentMember, validEmail } from '../../../../lib/team';
export const runtime = 'edge';
export async function GET(request: Request) {
  try {
    const member = await currentMember(request);
    if (!member || member.role === 'client') return json({ error:'Team access required.' },403);
    const rows = await db().prepare('SELECT email,role,created_at FROM team_members WHERE team_id = ? ORDER BY created_at').bind(member.team_id).all();
    return json({ members: rows.results });
  } catch { return json({ error:'Could not load team members.' },503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error:'Request origin rejected.' },403);
  try {
    const member = await currentMember(request);
    if (member?.role !== 'admin') return json({ error:'Admin access required.' },403);
    const data = await body(request);
    const email = validEmail(data.email);
    if (!email || !['tester','client'].includes(String(data.role))) return json({ error:'Enter a valid email and choose tester or client.' },400);
    if (email === member.email) return json({ error:'Your admin role cannot be changed here.' },400);
    const existing = await db().prepare('SELECT team_id,role FROM team_members WHERE email = ?').bind(email).first<{team_id:string;role:string}>();
    if (existing && existing.team_id !== member.team_id) return json({ error:'This account belongs to another team.' },409);
    if (existing?.role === 'admin') return json({ error:'Admin role cannot be changed here.' },403);
    if (existing) await db().prepare('UPDATE team_members SET role = ? WHERE email = ? AND team_id = ?').bind(data.role,email,member.team_id).run();
    else await db().prepare('INSERT INTO team_members (id,team_id,email,role,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),member.team_id,email,data.role,new Date().toISOString()).run();
    return json({ email,role:data.role },existing?200:201);
  } catch { return json({ error:'Could not save the team member.' },503); }
}
