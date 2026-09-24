import type { IncomingMessage } from "node:http";

export function createRateLimiter(options: { windowMs: number; maxAttempts: number }): {
  isLimited(key: string): boolean;
  register(key: string): void;
};
export function normalizeIp(value: unknown): string | null;
export function rateLimitKeyForIp(ip: string): string;
export function getClientKey(request?: Request | IncomingMessage | null): string;
