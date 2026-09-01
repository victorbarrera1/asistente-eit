/**
 * Límite de caracteres para el input del chat, en el cliente.
 *
 * Se mantiene deliberadamente más estricto que MAX_MESSAGE_LENGTH (3000) de
 * api/_lib/chat-handler.js: 500 caracteres alcanza de sobra para una
 * pregunta real y evita que el usuario recién se entere del límite cuando
 * el servidor ya rechazó el mensaje. Si se cambia aquí, no hace falta tocar
 * el límite del servidor (solo hay que mantenerse por debajo de 3000).
 */
export const MAX_CHAT_MESSAGE_LENGTH = 500;
