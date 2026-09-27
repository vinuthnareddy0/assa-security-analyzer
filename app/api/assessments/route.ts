import { db, sameOrigin, json, body } from '../../../lib/server';
import { currentMember, eventStatement } from '../../../lib/team';
import { clientAssessments } from '../../../lib/team-queries';
import { normalizeDomain, isDemoHost, scanDomain } from '../../../lib/scanner.mjs';

export const runtime = 'edge';

export async function GET(request: Request) {
  const member = await currentMember(request);
  if (!member) return json({ error: 'Team access required.' }, 403);
  try {
    const result = member.role === 'client'
      ? await db().prepare(clientAssessments).bind(member.team_id,member.email).all()
      : await db().prepare('SELECT a.id,a.name,a.domain,a.status,a.created_at,a.finished_at,a.error,a.result_json FROM assessments a LEFT JOIN team_members m ON m.user_id = a.owner_id WHERE a.owner_id = ? OR m.team_id = ? ORDER BY a.created_at DESC LIMIT 30').bind(member.team_id,member.team_id).all();
    return json({ assessments: result.results.map(({result_json,...row}) => ({...row, findingCount: result_json ? JSON.parse(String(result_json)).findings.length : null})) });
  } catch { return json({ error: 'Assessment history is unavailable. Try again shortly.' }, 503); }
}

export async function POST(request: Request) {
  const member = await currentMember(request);
  if (!member || member.role === 'client') return json({ error: 'Tester or admin access required.' }, 403);
  const user = member.user_id!;
  if (!sameOrigin(request)) return json({ error: 'Request origin was rejected.' }, 403);
  let id: string | null = null;
  try {
    const data = await body(request);
    const domain = normalizeDomain(data.domain);
    const name = typeof data.name === 'string' ? data.name.trim().slice(0, 100) : '';
    let projectId: string | null = null;
    if (data.projectId) {
      const project=await db().prepare('SELECT id,domain FROM projects WHERE id = ? AND team_id = ?').bind(data.projectId,member.team_id).first<{id:string;domain:string}>();
      if (!project || project.domain !== domain) return json({ error:'The project must match the exact target domain.' },400);
      projectId=project.id;
    }
    if (!name) return json({ error: 'Enter an assessment name.' }, 400);
    if (data.authorized !== true) return json({ error: 'Confirm your authorization for the exact target domain.' }, 400);
    if (!isDemoHost(domain)) {
      const record = await db().prepare('SELECT verified_until FROM domain_verifications WHERE owner_id = ? AND domain = ?').bind(user,domain).first<{verified_until:string|null}>();
      if (!record?.verified_until || record.verified_until < new Date().toISOString()) return json({ error: `Verify ownership of ${domain} before assessing it.`, verificationRequired: true }, 403);
    }
    const since = new Date(Date.now() - 3600_000).toISOString();
    const recent = await db().prepare('SELECT COUNT(*) AS count FROM assessments WHERE owner_id = ? AND created_at > ?').bind(user,since).first<{count:number}>();
    if ((recent?.count || 0) >= 3) return json({ error: 'Assessment limit reached. You can run up to three assessments per hour.' }, 429);
    id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await db().prepare('INSERT INTO assessments (id,owner_id,name,domain,status,created_at,project_id) VALUES (?,?,?,?,?,?,?)').bind(id,user,name,domain,'running',createdAt,projectId).run();
    if (projectId) await db().batch([db().prepare("UPDATE projects SET status = 'Assessing',progress_note = 'Assessment running.',updated_at = ? WHERE id = ? AND team_id = ?").bind(createdAt,projectId,member.team_id),eventStatement(member.team_id,projectId,member.email,'started',`Assessment started for ${domain}.`,createdAt)]);
    const result = await scanDomain(domain, fetch, { crawl:data.crawl === true });
    const saveRun=db().prepare('UPDATE assessments SET status = ?,finished_at = ?,result_json = ? WHERE id = ? AND owner_id = ?').bind('completed',result.finishedAt,JSON.stringify(result),id,user);
    if (projectId) await db().batch([saveRun,db().prepare("UPDATE projects SET status = 'Reporting', progress_note = 'Assessment complete; evidence ready for review.', updated_at = ? WHERE id = ? AND team_id = ?").bind(result.finishedAt,projectId,member.team_id),eventStatement(member.team_id,projectId,member.email,'completed',`Assessment completed: ${result.findings.length} observations recorded.`,result.finishedAt)]);
    else await saveRun.run();
    return json({ assessment: { id, name, domain, status:'completed', created_at:createdAt, finished_at:result.finishedAt, project_id:projectId, result } },201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Assessment failed.';
    if (id) {
      const now=new Date().toISOString();
      const failed=await db().prepare('SELECT project_id FROM assessments WHERE id = ? AND owner_id = ?').bind(id,user).first<{project_id:string|null}>().catch(()=>null);
      await db().prepare('UPDATE assessments SET status = ?,finished_at = ?,error = ? WHERE id = ? AND owner_id = ?').bind('failed',now,message,id,user).run().catch(() => {});
      if (failed?.project_id) await db().batch([db().prepare("UPDATE projects SET status = 'Approved',progress_note = 'Assessment could not complete; review the error and retry.',updated_at = ? WHERE id = ? AND team_id = ?").bind(now,failed.project_id,member.team_id),eventStatement(member.team_id,failed.project_id,member.email,'failed','Assessment failed; see saved run for details.',now)]).catch(()=>{});
    }
    return json({ error: message, id }, id ? 502 : 400);
  }
}
