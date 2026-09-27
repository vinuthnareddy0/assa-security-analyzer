import { json } from '../../../../lib/server';
import { currentMember } from '../../../../lib/team';
export const runtime = 'edge';
export async function GET(request: Request) {
  try {
    const member = await currentMember(request);
    return member ? json({ member }) : json({ error:'Your account has not been added to the ASSA team.' },403);
  } catch { return json({ error:'Team access is unavailable.' },503); }
}
