const DEMO_HOSTS = new Set(['demo.testfire.net']);
const DNS_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const REQUEST_TIMEOUT = 12000;
const MAX_PAGES = 4;
const MAX_HTML_BYTES = 256 * 1024;
const CRAWL_TIMEOUT = 8000;

export function normalizeDomain(value) {
  if (typeof value !== 'string') throw new Error('Enter a domain name.');
  const host = value.trim().toLowerCase().replace(/\.$/, '');
  if (host.length > 253 || !host.includes('.') || /[:/@?#\\\s]/.test(host)) throw new Error('Enter a domain only, without a URL, path or port.');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('This domain is outside the public internet.');
  if (!host.split('.').every(label => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) throw new Error('Enter a valid public domain.');
  if (/^\d+(?:\.\d+){3}$/.test(host)) throw new Error('Use a domain name, not an IP address.');
  return host;
}

export function isDemoHost(domain) { return DEMO_HOSTS.has(domain); }

export function isPublicAddress(value) {
  const parts = value.split('.');
  if (parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
    const [a,b,c] = parts.map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 192 && b === 0 || a === 192 && b === 88 && c === 99 || a === 192 && b === 0 && c === 2 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  const ip = value.toLowerCase();
  if (!/^[0-9a-f:]+$/.test(ip) || !ip.includes(':')) return false;
  if (ip.startsWith('2001:db8:') || ip.startsWith('2001:10:') || ip.startsWith('2001:20:')) return false;
  return /^[23][0-9a-f]{0,3}:/.test(ip);
}

async function dnsQuery(name, type, fetchImpl = fetch) {
  const url = new URL(DNS_ENDPOINT);
  url.searchParams.set('name', name);
  url.searchParams.set('type', type);
  const response = await fetchImpl(url, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
  if (!response.ok) throw new Error(`DNS lookup failed (${response.status}).`);
  const data = await response.json();
  if (typeof data.Status !== 'number') throw new Error('DNS lookup returned an invalid response.');
  return (data.Answer || []).filter(answer => answer.type === ({ A:1, AAAA:28, MX:15, TXT:16 })[type]).slice(0, 25).map(answer => answer.data);
}

export async function getVerificationTxt(domain, fetchImpl = fetch) {
  return dnsQuery(`_assa-verify.${domain}`, 'TXT', fetchImpl);
}

function finding(id, severity, title, evidence, impact, remediation, source) {
  return { id, severity, title, asset: '', evidence, impact, remediation, source, status: 'Open' };
}

function sameHostRedirect(location, domain, base) {
  try { const url = new URL(location, base); return url.hostname.toLowerCase() === domain && ['https:', 'http:'].includes(url.protocol) && !url.port && !url.username && !url.password ? url : null; }
  catch { return null; }
}

async function fetchHeaders(url, fetchImpl, timeout = REQUEST_TIMEOUT) {
  return fetchImpl(url, { method: 'GET', redirect: 'manual', cache: 'no-store', headers: { 'user-agent': 'ASSA-Assessment/1.0 (authorized, bounded passive check)' }, signal: AbortSignal.timeout(timeout) });
}

async function readHtml(response) {
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) { await response.body?.cancel().catch(() => {}); return ''; }
  if (Number(response.headers.get('content-length')) > MAX_HTML_BYTES) { await response.body?.cancel().catch(() => {}); return ''; }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < MAX_HTML_BYTES) {
      const {value,done} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_HTML_BYTES) break;
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const buffer = new Uint8Array(chunks.reduce((total,chunk)=>total+chunk.length,0));
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk,offset); offset += chunk.length; }
  return new TextDecoder().decode(buffer);
}

export function safeLinkedPaths(html, domain, base) {
  const paths = [];
  const blocked = /(?:^|\/)(?:logout|signout|delete|remove|transfer|purchase|checkout|pay|admin|settings|account|login|register|reset|upload|unsubscribe|update|edit|submit|action)(?:\/|\.|$)/i;
  const links = html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']{1,180})["']/gi);
  for (const [,href] of links) {
    try {
      const url = new URL(href.replaceAll('&amp;','&'),base);
      if (url.hostname.toLowerCase() !== domain || url.protocol !== 'https:' || url.port || url.username || url.password || url.search || blocked.test(url.pathname)) continue;
      if (!/(?:\/|\.(?:html?|jsp|php|aspx))$/i.test(url.pathname) && !/^\/(?:about|help|docs|contact|privacy|terms)$/i.test(url.pathname) || url.pathname.length > 120) continue;
      if (!paths.includes(url.pathname) && url.pathname !== '/') paths.push(url.pathname);
      if (paths.length === 12) break;
    } catch { /* Skip malformed links. */ }
  }
  return paths;
}

export async function scanDomain(domain, fetchImpl = fetch, options = {}) {
  const host = normalizeDomain(domain);
  const startedAt = new Date().toISOString();
  const [a, aaaa, mx, txt] = await Promise.all(['A','AAAA','MX','TXT'].map(type => dnsQuery(host, type, fetchImpl)));
  const addresses = [...a, ...aaaa];
  if (!addresses.length) throw new Error('No public A or AAAA records were found.');
  if (!addresses.every(isPublicAddress)) throw new Error('Assessment blocked: DNS resolved to a non-public or reserved address.');
  const findings = [];
  let https, http, httpsError = null, httpError = null;
  const pages = [];
  let html = '';
  let httpsUrl = `https://${host}/`;
  try { https = await fetchHeaders(`https://${host}/`, fetchImpl); }
  catch (error) { httpsError = error instanceof Error ? error.message : 'HTTPS request failed'; }
  try { http = await fetchHeaders(`http://${host}/`, fetchImpl); }
  catch (error) { httpError = error instanceof Error ? error.message : 'HTTP request failed'; }
  if (!https && !http) throw new Error('The host could not be reached over HTTP or HTTPS.');
  const headers = https?.headers;
  if (https) {
    const redirectsTo = https.status >= 300 && https.status < 400 ? sameHostRedirect(headers.get('location'), host, `https://${host}/`) : null;
    if (https.status >= 300 && https.status < 400 && redirectsTo?.protocol === 'https:') {
      await https.body?.cancel().catch(() => {});
      try {
        const next = await fetchHeaders(redirectsTo.toString(), fetchImpl);
        https = next;
        httpsUrl = redirectsTo.toString();
      } catch (error) { httpsError = `Redirect check failed: ${error instanceof Error?error.message:'Request failed'}`; }
    }
    const h = https.headers;
    if (options.crawl === true && https.status >= 200 && https.status < 300) html = await readHtml(https).catch(() => '');
    else await https.body?.cancel().catch(() => {});
    pages.push({ path: new URL(httpsUrl).pathname, status: https.status, contentType:h.get('content-type'), csp:h.has('content-security-policy'), framePolicy:h.has('x-frame-options') || /frame-ancestors/i.test(h.get('content-security-policy') || '') });
    if (!h.has('strict-transport-security')) findings.push(finding('HSTS', 'Medium', 'HSTS header not observed', 'Strict-Transport-Security was absent from the HTTPS home-page response.', 'Browsers may not be instructed to use HTTPS on future visits.', 'Consider an HSTS policy after verifying that every relevant service supports HTTPS.', 'HTTP headers'));
    if (!h.has('content-security-policy')) findings.push(finding('CSP', 'Medium', 'Content Security Policy not observed', 'Content-Security-Policy was absent from the HTTPS home-page response.', 'The page lacks this additional browser-side mitigation against injected content.', 'Develop and test a Content-Security-Policy suitable for this application.', 'HTTP headers'));
    if ((h.get('x-content-type-options') || '').toLowerCase() !== 'nosniff') findings.push(finding('NOSNIFF', 'Low', 'MIME sniffing protection not observed', 'X-Content-Type-Options: nosniff was absent from the HTTPS home-page response.', 'Some browsers may infer content types unexpectedly.', 'Set X-Content-Type-Options to nosniff.', 'HTTP headers'));
    if (!h.has('x-frame-options') && !/frame-ancestors/i.test(h.get('content-security-policy') || '')) findings.push(finding('FRAME', 'Medium', 'Frame embedding restriction not observed', 'Neither X-Frame-Options nor a CSP frame-ancestors directive was observed.', 'Other sites may be able to frame the page.', 'Set an appropriate CSP frame-ancestors directive or X-Frame-Options policy.', 'HTTP headers'));
    if (!h.has('referrer-policy')) findings.push(finding('REFERRER', 'Low', 'Referrer Policy not observed', 'Referrer-Policy was absent from the HTTPS home-page response.', 'Referrer information may be shared more broadly than intended.', 'Set a Referrer-Policy appropriate for the application.', 'HTTP headers'));
    const server = h.get('server') || '';
    if (/\d+\.\d+/.test(server)) findings.push(finding('SERVER', 'Low', 'Server version exposed', `Server header reported: ${server.slice(0,120)}.`, 'Version information may aid technology fingerprinting.', 'Review whether the version detail is needed and keep software patched.', 'HTTP headers'));
    const cookies = typeof h.getSetCookie === 'function' ? h.getSetCookie() : h.get('set-cookie') ? [h.get('set-cookie')] : [];
    cookies.slice(0, 8).forEach((cookie, index) => {
      const name = cookie.split('=')[0].trim().slice(0, 60);
      if (!/;\s*secure(?:;|$)/i.test(cookie)) findings.push(finding(`COOKIE-SECURE-${index}`, 'Medium', `Cookie ${name} lacks Secure`, `Set-Cookie for ${name} did not include Secure.`, 'The cookie could be sent over HTTP.', 'Add Secure to the cookie and enforce HTTPS.', 'HTTP cookies'));
      if (!/;\s*httponly(?:;|$)/i.test(cookie)) findings.push(finding(`COOKIE-HTTPONLY-${index}`, 'Low', `Cookie ${name} lacks HttpOnly`, `Set-Cookie for ${name} did not include HttpOnly.`, 'Client-side scripts may access the cookie.', 'Add HttpOnly if client-side scripts do not need the cookie.', 'HTTP cookies'));
    });
  }
  await http?.body?.cancel().catch(() => {});
  if (http && !(http.status >= 300 && http.status < 400 && sameHostRedirect(http.headers.get('location'), host, `http://${host}/`)?.protocol === 'https:')) {
    findings.push(finding('HTTP-REDIRECT', 'Medium', 'HTTP did not redirect to HTTPS', `HTTP home page returned status ${http.status} without a same-host HTTPS redirect.`, 'Visitors may be able to reach content over unencrypted HTTP.', 'Redirect HTTP to HTTPS after verifying site behavior.', 'HTTP response'));
  }
  if (options.crawl === true && html) {
    const paths = safeLinkedPaths(html,host,httpsUrl);
    for (const path of paths.slice(0,MAX_PAGES-1)) {
      try {
        const response = await fetchHeaders(`https://${host}${path}`,fetchImpl,CRAWL_TIMEOUT);
        pages.push({path,status:response.status,contentType:response.headers.get('content-type'),csp:response.headers.has('content-security-policy'),framePolicy:response.headers.has('x-frame-options') || /frame-ancestors/i.test(response.headers.get('content-security-policy') || '')});
        await response.body?.cancel().catch(() => {});
      } catch (error) { pages.push({path,status:null,error:error instanceof Error?error.message:'Request failed'}); }
    }
  }
  const observedHeaders = https ? Object.fromEntries(['strict-transport-security','content-security-policy','x-content-type-options','x-frame-options','referrer-policy','server'].map(key => [key, https.headers.get(key)])) : {};
  return {
    domain: host, startedAt, finishedAt: new Date().toISOString(),
    scope: options.crawl === true ? `https://${host}/ and up to ${MAX_PAGES-1} same-host linked pages; http://${host}/ redirect check` : `https://${host}/ and http://${host}/ only`,
    dns: { A: a, AAAA: aaaa, MX: mx, TXT: txt.slice(0, 10) },
    web: { httpsStatus: https?.status ?? null, httpStatus: http?.status ?? null, httpsError, httpError, headers: observedHeaders, pages },
    findings: findings.map(item => ({ ...item, asset: host })),
    limitations: ['DNS, home-page response, and optionally up to three same-host linked HTML pages only; no login, forms, scripts, port scan, TLS certificate inspection, repository access, or exploitation.', 'Linked pages are listed as observations. Missing headers do not prove a vulnerability or exploitability.'],
  };
}
