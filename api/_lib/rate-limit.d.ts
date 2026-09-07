import type { IncomingMessage } from "node:http";

export function getClientKey(request?: Request | IncomingMessage | null): string;
