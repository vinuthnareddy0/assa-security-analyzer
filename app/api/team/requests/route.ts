import { db, sameOrigin, json, body } from '../../../../lib/server';
import { currentMember, label } from '../../../../lib/team';
import { normalizeDomain } from '../../../../lib/scanner.mjs';
export const runtime = 'edge';
export async function GET(request: Request) {
  try {
    const member=await currentMember(request);
    if (!member) return json({ error:'Team access required.' },403);
    const rows=member.role==='client'
      ? await db().prepare('SELECT * FROM project_requests WHERE team_id = ? AND client_email = ? ORDER BY created_at DESC LIMIT 100').bind(member.team_id,member.email).all()
      : await db().prepare('SELECT * FROM project_requests WHERE team_id = ? ORDER BY created_at DESC LIMIT 100').bind(member.team_id).all();
    return json({ requests:rows.results });
  } catch { return json({ error:'Could not load requests.' },503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error:'Request origin rejected.' },403);
  try {
    const member=await currentMember(request);
    if (member?.role!=='client') return json({ error:'Client access required.' },403);
    const data=await body(request), name=label(data.name), details=typeof data.details==='string'?data.details.trim():'';
    if (!name || details.length>1000) return json({ error:'Enter a project name and a short description.' },400);
    const domain=normalizeDomain(data.domain), id=crypto.randomUUID();
    await db().prepare('INSERT INTO project_requests (id,team_id,client_email,name,domain,details,status,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,member.team_id,member.email,name,domain,details,'Pending',new Date().toISOString()).run();
    return json({ id },201);
  } catch (error) { return json({ error:error instanceof Error?error.message:'Could not create request.' },400); }
}
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return json({ error:'Request origin rejected.' },403);
  try {
    const member=await currentMember(request);
    if (member?.role!=='admin') return json({ error:'Admin access required.' },403);
    const data=await body(request);
    if (!['Approved','Declined'].includes(String(data.status)) || typeof data.id!=='string') return json({ error:'Invalid request update.' },400);
    const requested=await db().prepare('SELECT * FROM project_requests WHERE id = ? AND team_id = ?').bind(data.id,member.team_id).first<Record<string,string>>();
    if (!requested) return json({ error:'Request not found.' },404);
    if (requested.status!=='Pending') return json({ error:'Request has already been reviewed.' },409);
    const update = db().prepare("UPDATE project_requests SET status = ? WHERE id = ? AND team_id = ? AND status = 'Pending'").bind(data.status,data.id,member.team_id);
    if (data.status==='Approved') {
      const id=crypto.randomUUID(), now=new Date().toISOString();
      await db().batch([update, db().prepare("INSERT OR IGNORE INTO projects (id,team_id,name,domain,client_email,request_id,status,progress_note,created_at,updated_at) SELECT ?,team_id,name,domain,client_email,id,'Approved','Assessment queued',?,? FROM project_requests WHERE id = ? AND team_id = ? AND status = 'Approved'").bind(id,now,now,data.id,member.team_id), db().prepare("INSERT INTO project_events (id,project_id,team_id,actor_email,kind,note,created_at) SELECT ?,p.id,p.team_id,?,'approved','Project request approved and queued.',? FROM projects p WHERE p.request_id = ? AND p.team_id = ? AND p.id = ?").bind(crypto.randomUUID(),member.email,now,data.id,member.team_id,id)]);
    } else await update.run();
    return json({ updated:true });
  } catch { return json({ error:'Could not review request.' },503); }
}
