import { db, sameOrigin, json, body } from '../../../../lib/server';
import { currentMember, validEmail, label, eventStatement } from '../../../../lib/team';
import { clientProjects } from '../../../../lib/team-queries';
import { normalizeDomain } from '../../../../lib/scanner.mjs';
export const runtime = 'edge';
const statuses = ['Requested','Approved','Assessing','Reporting','Complete'];
export async function GET(request: Request) {
  try {
    const member = await currentMember(request);
    if (!member) return json({ error:'Team access required.' },403);
    const rows = member.role === 'client'
      ? await db().prepare(clientProjects).bind(member.team_id,member.email).all()
      : await db().prepare('SELECT * FROM projects WHERE team_id = ? ORDER BY updated_at DESC LIMIT 100').bind(member.team_id).all();
    const projects = await Promise.all(rows.results.map(async project => {
      const stats = await db().prepare('SELECT COUNT(*) AS runs, MAX(finished_at) AS last_run FROM assessments WHERE project_id = ? AND status = ?').bind(project.id,'completed').first();
      const events = await db().prepare('SELECT kind,note,actor_email,created_at FROM project_events WHERE project_id = ? AND team_id = ? ORDER BY created_at DESC LIMIT 30').bind(project.id,member.team_id).all();
      return {...project, runs: stats?.runs || 0, last_run: stats?.last_run || null, events:events.results};
    }));
    return json({ projects });
  } catch { return json({ error:'Could not load projects.' },503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error:'Request origin rejected.' },403);
  try {
    const member = await currentMember(request);
    if (member?.role !== 'admin') return json({ error:'Admin access required.' },403);
    const data = await body(request), name = label(data.name), email = data.clientEmail ? validEmail(data.clientEmail) : null;
    if (!name || data.clientEmail && !email) return json({ error:'Enter a project name and a valid client email.' },400);
    const domain = normalizeDomain(data.domain);
    if (email) {
      const client = await db().prepare("SELECT role FROM team_members WHERE team_id = ? AND email = ?").bind(member.team_id,email).first<{role:string}>();
      if (client?.role !== 'client') return json({ error:'Add this client as a team member first.' },400);
    }
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await db().batch([db().prepare('INSERT INTO projects (id,team_id,name,domain,client_email,status,progress_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,member.team_id,name,domain,email,'Approved','',now,now), eventStatement(member.team_id,id,member.email,'created','Project created and ready for assessment.',now)]);
    return json({ id },201);
  } catch (error) { return json({ error:error instanceof Error?error.message:'Could not create project.' },400); }
}
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return json({ error:'Request origin rejected.' },403);
  try {
    const member = await currentMember(request);
    if (!member || member.role === 'client') return json({ error:'Tester or admin access required.' },403);
    const data = await body(request), status=String(data.status), note=typeof data.note === 'string'?data.note.trim():'';
    if (!statuses.includes(status) || note.length>1000 || typeof data.id !== 'string') return json({ error:'Invalid project update.' },400);
    const project = await db().prepare('SELECT id FROM projects WHERE id = ? AND team_id = ?').bind(data.id,member.team_id).first();
    if (!project) return json({ error:'Project not found.' },404);
    const now = new Date().toISOString();
    await db().batch([db().prepare('UPDATE projects SET status = ?,progress_note = ?,updated_at = ? WHERE id = ? AND team_id = ?').bind(status,note,now,data.id,member.team_id), eventStatement(member.team_id,data.id,member.email,'progress',`${status}: ${note || 'No additional note.'}`,now)]);
    return json({ updated:true });
  } catch { return json({ error:'Could not update project.' },503); }
}
