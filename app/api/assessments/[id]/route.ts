import { db, json } from '../../../../lib/server';

import { clientAssessmentById } from '../../../../lib/team-queries';
import { currentMember } from '../../../../lib/team';

export const runtime = 'edge';

export async function GET(request: Request, context: { params: Promise<{id:string}> }) {
  const member = await currentMember(request);
  if (!member) return json({ error: 'Team access required.' }, 403);
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid assessment ID.' }, 400);
    const row = member.role === 'client'
      ? await db().prepare(clientAssessmentById).bind(id,member.team_id,member.email).first<Record<string,unknown>>()
      : await db().prepare('SELECT a.* FROM assessments a LEFT JOIN team_members m ON m.user_id = a.owner_id WHERE a.id = ? AND (a.owner_id = ? OR m.team_id = ?)').bind(id,member.team_id,member.team_id).first<Record<string,unknown>>();
    if (!row) return json({ error: 'Assessment not found.' }, 404);
    const { result_json, ...rest } = row;
    return json({ assessment: { ...rest, result: result_json ? JSON.parse(String(result_json)) : null } });
  } catch { return json({ error: 'Assessment is unavailable. Try again shortly.' }, 503); }
}
