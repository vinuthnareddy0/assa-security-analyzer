export function normalizeDomain(value: unknown): string;
export function isDemoHost(domain: string): boolean;
export function isPublicAddress(address: string): boolean;
export function getVerificationTxt(domain: string, fetchImpl?: typeof fetch): Promise<string[]>;
export type ScanFinding = { id: string; severity: string; title: string; asset: string; evidence: string; impact: string; remediation: string; source: string; status: string };
export type ScanResult = { domain: string; startedAt: string; finishedAt: string; scope: string; dns: Record<string,string[]>; web: { httpsStatus: number|null; httpStatus: number|null; httpsError: string|null; httpError: string|null; headers: Record<string,string|null>; pages: Array<{path:string;status:number|null;contentType?:string|null;csp?:boolean;framePolicy?:boolean;error?:string}> }; findings: ScanFinding[]; limitations: string[] };
export function safeLinkedPaths(html: string, domain: string, base: string): string[];
export function scanDomain(domain: string, fetchImpl?: typeof fetch, options?: {crawl?:boolean}): Promise<ScanResult>;
