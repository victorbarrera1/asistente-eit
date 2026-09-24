/**
 * Contexto por petición, disponible en cualquier punto del procesamiento.
 * Lo abre src/server.ts (Dokku / dev) con runWithRequestContext().
 *
 * Existe porque TanStack Start no garantiza que el Request que llega a un
 * handler de API sea el mismo objeto que recibió el servidor Node: la IP del
 * socket (request.ip de srvx) puede perderse en el camino, y sin ella el rate
 * limiting tendría que confiar en cabeceras que el cliente controla.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

/**
 * @param {{peerIp?: string, cspNonce?: string}} context
 * @param {() => T} fn
 * @returns {T}
 * @template T
 */
export function runWithRequestContext(context, fn) {
  return storage.run(Object.freeze({ ...context }), fn);
}

/** @returns {{peerIp?: string, cspNonce?: string} | undefined} */
export function getRequestContext() {
  return storage.getStore();
}
