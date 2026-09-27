import { db, sameOrigin, json, body } from '../../../lib/server';
import { normalizeDomain, isDemoHost, getVerificationTxt } from '../../../lib/scanner.mjs';

import { currentMember } from '../../../lib/team';

export const runtime = 'edge';

export async function POST(request: Request) {
  const member = await currentMember(request);
  if (!member || member.role === 'client') return json({ error: 'Tester or admin access required.' }, 403);
  const user = member.user_id!;
  if (!sameOrigin(request)) return json({ error: 'Request origin was rejected.' }, 403);
  try {
    const data = await body(request);
    const domain = normalizeDomain(data.domain);
    if (isDemoHost(domain)) return json({ domain, verified: true, demo: true });
    const now = new Date();
    if (data.check === true) {
      const record = await db().prepare('SELECT token, expires_at, verified_until FROM domain_verifications WHERE owner_id = ? AND domain = ?').bind(user, domain).first<{token:string;expires_at:string;verified_until:string|null}>();
      if (!record) return json({ error: 'Create a verification challenge first.' }, 404);
      if (record.verified_until && record.verified_until > now.toISOString()) return json({ domain, verified: true });
      if (record.expires_at < now.toISOString()) return json({ error: 'Verification challenge expired. Create a new one.' }, 400);
      const values = await getVerificationTxt(domain);
      const expected = `assa-verification=${record.token}`;
      if (!values.some((entry:string) => entry.replace(/^"|"$/g, '') === expected)) return json({ domain, verified: false, instruction: `Add TXT ${expected} at _assa-verify.${domain}, then check again.` });
      const verifiedUntil = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString();
      await db().prepare('UPDATE domain_verifications SET verified_until = ? WHERE owner_id = ? AND domain = ?').bind(verifiedUntil,user,domain).run();
      return json({ domain, verified: true, verifiedUntil });
    }
    const token = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
    await db().prepare('INSERT INTO domain_verifications (id,owner_id,domain,token,expires_at,verified_until) VALUES (?,?,?,?,?,NULL) ON CONFLICT(owner_id,domain) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at,verified_until=NULL').bind(crypto.randomUUID(),user,domain,token,expiresAt).run();
    return json({ domain, verified: false, recordName: `_assa-verify.${domain}`, recordValue: `assa-verification=${token}`, expiresAt });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Verification failed.' }, 400); }
}
