export type RequestContext = { peerIp?: string; cspNonce?: string };
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T;
export function getRequestContext(): RequestContext | undefined;
