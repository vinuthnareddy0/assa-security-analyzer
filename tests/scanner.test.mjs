import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, isPublicAddress, scanDomain } from '../lib/scanner.mjs';

test('rejects non-domain targets and private addresses', () => {
  for (const target of ['http://example.com','localhost','127.0.0.1','example.com:8080','example.com/path','host.internal']) assert.throws(() => normalizeDomain(target));
  for (const address of ['127.0.0.1','10.0.0.1','169.254.1.4','192.168.1.1','203.0.113.2','::1','fd00::1']) assert.equal(isPublicAddress(address),false);
  assert.equal(isPublicAddress('93.184.215.14'),true);
});

test('turns observed headers and redirects into evidence', async () => {
  const calls=[];
  const mock=async url => {
    const target=new URL(url); calls.push(target.toString());
    if (target.hostname==='cloudflare-dns.com') {
      const type=target.searchParams.get('type');
      return Response.json({Status:0,Answer:type==='A'?[{type:1,data:'93.184.215.14'}]:[]});
    }
    if (target.protocol==='http:') return new Response(null,{status:301,headers:{location:'https://demo.testfire.net/'}});
    return new Response(null,{status:200,headers:{server:'nginx/1.26','x-content-type-options':'nosniff'}});
  };
  const result=await scanDomain('demo.testfire.net',mock);
  assert.equal(result.dns.A[0],'93.184.215.14');
  assert.ok(result.findings.some(f=>f.id==='HSTS'));
  assert.ok(result.findings.some(f=>f.id==='SERVER'));
  assert.ok(!result.findings.some(f=>f.id==='NOSNIFF' || f.id==='HTTP-REDIRECT'));
  assert.equal(calls.filter(value=>value.startsWith('https://demo.testfire.net/')).length,1);
});

test('blocks scanning when DNS contains a private address',async () => {
  const mock=async url => {
    const target=new URL(url);
    if (target.hostname!=='cloudflare-dns.com') throw new Error('Should never contact a web target');
    return Response.json({Status:0,Answer:target.searchParams.get('type')==='A'?[{type:1,data:'10.0.0.5'}]:[]});
  };
  await assert.rejects(scanDomain('example.com',mock),/non-public/);
});

test('passive crawl stays on one host, skips action links, and stops after four pages', async () => {
  const visited=[];
  const html='<a href="/about">About</a><a href="/help.html">Help</a><a href="/docs/">Docs</a><a href="/more.jsp">More</a><a href="https://other.example/contact">Other</a><a href="/logout">Logout</a><a href="/pay">Pay</a><a href="/about?token=private">Query</a>';
  const mock=async url=>{
    const target=new URL(url);
    if(target.hostname==='cloudflare-dns.com')return Response.json({Status:0,Answer:target.searchParams.get('type')==='A'?[{type:1,data:'93.184.215.14'}]:[]});
    visited.push(target.toString());
    if(target.protocol==='http:')return new Response(null,{status:301,headers:{location:'https://demo.testfire.net/'}});
    return new Response(target.pathname==='/'?html:'', {status:200,headers:{'content-type':'text/html','content-security-policy':"default-src 'self'"}});
  };
  const result=await scanDomain('demo.testfire.net',mock,{crawl:true});
  assert.equal(result.web.pages.length,4);
  assert.deepEqual(result.web.pages.map(page=>page.path),['/','/about','/help.html','/docs/']);
  assert.ok(visited.every(url=>new URL(url).hostname==='demo.testfire.net'));
  assert.ok(visited.every(url=>!url.includes('logout')&&!url.includes('pay')&&!url.includes('?')));
});
