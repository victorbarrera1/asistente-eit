import type { IncomingMessage } from "node:http";

export const SESSION_COOKIE_NAME: "eit_admin_session";
export function buildSessionCookie(token: string, request?: Request | IncomingMessage): string;
export function buildClearSessionCookie(request?: Request | IncomingMessage): string;
export function parseCookie(cookieHeader: string | null | undefined, name: string): string | null;
