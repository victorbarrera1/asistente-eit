/**
 * Núcleo RAG compartido con soporte multi-proveedor:
 * - On-Premise (Ollama: Llama 3.1 8B + BGE-M3 1024d) para Dokku/Producción UDP.
 * - Cloud Fallback (Google Gemini: 2.5 Flash + text-embedding-004 768d) para Vercel Demo.
 */
import { SYSTEM_PROMPT_EIT } from "../system_prompt_eit.js";

/**
 * Identidad de embeddings por proveedor.
 *
 * Cada proveedor vive en su propio espacio vectorial, con su dimensión, su
 * columna y su función de búsqueda. Tenerlo declarado en un solo lugar es lo que
 * impide que las tres cosas se desincronicen: ese desajuste ya rompió el índice
 * antes (ver el encabezado de scripts/migrations/003_bge_m3_1024.sql).
 */
export const EMBEDDING_SPACES = {
  ollama: { dim: 1024, column: "embedding_1024", rpc: "buscar_docs_v2" },
  gemini: { dim: 768, column: "embedding", rpc: "buscar_docs" },
};

export function getAIConfig() {
  // La detección automática anterior (`GEMINI_API_KEY ? "gemini" : "ollama"`)
  // era una trampa: bastaba con tener la clave presente en el .env para que todo
  // el sistema —embeddings incluidos— cambiara de espacio vectorial sin que
  // nadie lo pidiera. Ahora el proveedor se declara explícitamente, y el default
  // es el despliegue real de producción: on-premise.
  const provider = (process.env.AI_PROVIDER || "ollama").toLowerCase();

  const geminiKey = process.env.GEMINI_API_KEY || "";
  const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const geminiEmbedModel = process.env.GEMINI_EMBED_MODEL || "text-embedding-004";

  const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(
    /\/+$/,
    "",
  );
  const ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5:7b";
  const ollamaEmbedModel = process.env.OLLAMA_EMBED_MODEL || "bge-m3";

  const space = EMBEDDING_SPACES[provider] ?? EMBEDDING_SPACES.ollama;

  // Modelo de embeddings ACTIVO. searchDocs() y scrape.js leían siempre
  // `ollamaEmbedModel`, así que con Gemini se consultaba y se etiquetaba como
  // "bge-m3" mientras los vectores venían de text-embedding-004.
  const embedModel = provider === "gemini" ? geminiEmbedModel : ollamaEmbedModel;
  const embedDim = Number(process.env.EMBED_DIM || space.dim);

  return {
    provider,
    geminiKey,
    geminiModel,
    geminiEmbedModel,
    ollamaBaseUrl,
    ollamaModel,
    ollamaEmbedModel,
    // Identidad activa: es lo único que deben usar searchDocs() y scrape.js.
    embedModel,
    embedDim,
    embedColumn: space.column,
    searchRpc: space.rpc,
  };
}

/**
 * Valida que la configuración sea internamente coherente; lanza si no lo es.
 *
 * Existe porque el modo de falla de este proyecto no es el error ruidoso sino el
 * silencioso: una dimensión que no calza devuelve cero filas, y cero filas se
 * confunde con "no hay nada relevante". Es preferible no arrancar.
 */
export function assertAIConfig() {
  const c = getAIConfig();

  if (!EMBEDDING_SPACES[c.provider]) {
    throw new Error(`AI_PROVIDER="${c.provider}" no es válido. Valores aceptados: ollama, gemini.`);
  }
  if (c.provider === "gemini" && !c.geminiKey) {
    throw new Error('AI_PROVIDER="gemini" requiere GEMINI_API_KEY.');
  }

  const expected = EMBEDDING_SPACES[c.provider].dim;
  if (c.embedDim !== expected) {
    throw new Error(
      `EMBED_DIM=${c.embedDim} no corresponde al proveedor "${c.provider}" (espera ${expected}). ` +
        `Mezclar espacios vectoriales corrompe el índice en silencio.`,
    );
  }
  return c;
}

function supabaseEnv() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_KEY,
  };
}

// ─── Embeddings (Gemini / Ollama) ──────────────────────────────────────────

class EmbeddingConfigError extends Error {}

async function embedTextsGemini(texts, config) {
  if (!config.geminiKey) throw new EmbeddingConfigError("GEMINI_API_KEY no configurada");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiEmbedModel}:batchEmbedContents?key=${config.geminiKey}`;
  const requests = texts.map((text) => ({
    model: `models/${config.geminiEmbedModel}`,
    content: { parts: [{ text }] },
  }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embed error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!Array.isArray(data.embeddings)) {
    throw new Error("Respuesta inválida de Gemini embeddings");
  }
  return data.embeddings.map((e) => e.values);
}

async function embedTextsOllama(texts, opts = {}) {
  const config = getAIConfig();
  const baseUrl = opts.baseUrl ?? config.ollamaBaseUrl;
  const model = opts.model ?? config.ollamaEmbedModel;
  const expectedDim = opts.expectedDim ?? config.embedDim;

  let lastError;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: texts, keep_alive: -1 }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const detalle = (await res.text()).slice(0, 200);
        if (res.status === 404) {
          throw new EmbeddingConfigError(
            `el modelo "${model}" no existe en ${baseUrl}. Corre: ollama pull ${model}`,
          );
        }
        throw new Error(`HTTP ${res.status}: ${detalle}`);
      }

      const data = await res.json();
      const embeddings = data.embeddings;

      if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
        throw new Error(
          `respuesta inesperada: se pidieron ${texts.length} vectores y llegaron ${embeddings?.length ?? 0}`,
        );
      }

      for (const emb of embeddings) {
        if (!Array.isArray(emb) || emb.length !== expectedDim) {
          throw new EmbeddingConfigError(
            `dimensión inesperada: ${emb?.length ?? "?"} != ${expectedDim} esperadas para "${model}".`,
          );
        }
      }

      return embeddings;
    } catch (e) {
      lastError = e;
      if (e instanceof EmbeddingConfigError) break;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw new Error(`[Embedding] falló contra ${baseUrl} con "${model}": ${lastError.message}`);
}

export async function embedTexts(texts, opts = {}) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const config = getAIConfig();
  if (config.provider === "gemini") {
    return await embedTextsGemini(texts, config);
  }
  return await embedTextsOllama(texts, opts);
}

export async function embedText(text) {
  const [embedding] = await embedTexts([text]);
  return embedding;
}

// ─── Búsqueda semántica en Supabase ──────────────────────────────────────────
export const DEFAULT_MATCH_THRESHOLD = 0.55;

export async function searchDocs(
  embedding,
  matchCount = 5,
  matchThreshold = DEFAULT_MATCH_THRESHOLD,
) {
  const { url, key } = supabaseEnv();
  if (!url || !key) return [];
  const config = getAIConfig();

  try {
    // El RPC y el modelo salen de la identidad activa (ver EMBEDDING_SPACES).
    // buscar_docs (768, Gemini) no recibe p_embed_model porque es anterior a que
    // existiera esa columna: ese espacio no distingue modelos, y por eso mismo
    // solo debe contener vectores de un único modelo.
    const isGemini = config.provider === "gemini";
    const rpcName = config.searchRpc;
    const bodyPayload = {
      query_embedding: embedding,
      match_count: matchCount,
      match_threshold: matchThreshold,
      ...(isGemini ? {} : { p_embed_model: config.embedModel }),
    };

    const res = await fetch(`${url}/rest/v1/rpc/${rpcName}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[RAG] Error en RPC ${rpcName} (${res.status}): ${err.slice(0, 300)}`);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("[RAG] Fallo en searchDocs:", e.message);
    return [];
  }
}

// ─── Query Rewriting ─────────────────────────────────────────────────────────

const CHILEAN_STUDENT_TERMS = [
  "profe",
  "profes",
  "ayudante",
  "ayudantes",
  "ramo",
  "ramos",
  "malla",
  "convalidar",
  "convalidacion",
  "botar",
  "echar",
  "echarse",
  "aprobar",
  "reprobar",
  "certamen",
  "certamenes",
  "control",
  "controles",
  "solemne",
  "solemnes",
  "tne",
  "pase",
  "gratuidad",
  "beca",
  "becas",
  "dae",
  "secretaria",
  "sec",
  "practica",
  "practicas",
  "marcos",
  "fantoval",
  "ximena",
  "geoffroy",
  "luciano",
  "ahumada",
  "ejercito",
  "papeleta",
  "convalidar",
  "informe",
  "titulacion",
  "defensa",
  "comision",
  "tesis",
  "memoria",
  "capstone",
  "work-eit",
  "canvas",
  "portal",
  "udp",
  "eit",
  "docencia",
  "sala",
  "salas",
];

export function shouldRewrite(query) {
  if (!query || query.length < 5) return false;
  const q = query.toLowerCase();
  return CHILEAN_STUDENT_TERMS.some((term) => q.includes(term));
}

export async function rewriteQuery(query) {
  if (!shouldRewrite(query)) return query;
  const config = getAIConfig();

  const prompt = `Eres un normalizador de consultas estudiantiles chilenas para la Universidad Diego Portales (UDP).
Convierte la pregunta informal del estudiante a términos formales de búsqueda académica y administrativa institucional.
Si incluye modismos chilenos ("echar un ramo", "botar ramo", "profe", "el marcos"), tradúcelos al lenguaje reglamentario formal ("reprobar asignatura", "renuncia de asignatura", "profesor", "Coordinador de Prácticas Marcos Fantóval").
Devuelve ÚNICAMENTE la consulta formal optimizada en una sola línea, sin explicaciones ni comillas.

Consulta: "${query}"`;

  try {
    let result = "";
    if (config.provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = await res.json();
        result = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
    } else {
      const res = await fetch(`${config.ollamaBaseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.ollamaModel,
          prompt,
          stream: false,
          keep_alive: -1,
          options: { num_ctx: 1024, temperature: 0.0 },
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = await res.json();
        result = json.response || "";
      }
    }
    const clean = result.trim().replace(/^["']|["']$/g, "");
    return clean.length >= 3 ? clean : query;
  } catch {
    return query;
  }
}

// ─── Reranking y Construcción de Contexto ─────────────────────────────────────

export function rerankDocs(docs, query) {
  if (!docs || docs.length === 0) return [];
  const terms = (query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  const scored = docs.map((doc) => {
    let keywordScore = 0;
    const content = (doc.contenido || "").toLowerCase();
    const title = (doc.titulo || "").toLowerCase();

    for (const t of terms) {
      if (title.includes(t)) keywordScore += 0.3;
      if (content.includes(t)) keywordScore += 0.1;
    }

    const finalScore = (doc.similarity ?? 0.5) * 0.7 + Math.min(keywordScore, 0.5) * 0.3;
    return { ...doc, finalScore };
  });

  return scored.sort((a, b) => b.finalScore - a.finalScore);
}

/**
 * Reemplaza la ofuscación de correos de Cloudflare ("[email protected]").
 *
 * El reemplazo NO puede ser ciego. La versión anterior sustituía cualquier correo
 * ofuscado por practicas_eit@mail.udp.cl, lo que era válido mientras el corpus solo
 * tenía páginas de prácticas de la EIT. Al incorporar la página de Toma de Ramos,
 * esa regla convertía el correo de la Mesa de Ayuda en el del coordinador de
 * prácticas: un estudiante escribiría a la persona equivocada por un problema de
 * inscripción. Entregar un contacto incorrecto es peor que no entregar ninguno.
 *
 * @param {string} text - Contenido del chunk.
 * @param {string} [url] - URL de origen, para decidir si el correo de prácticas aplica.
 */
function cleanEmailObfuscation(text, url = "") {
  if (!text) return "";

  // Solo en páginas de prácticas de la EIT se puede afirmar cuál es el correo.
  const esPaginaDePracticas = /eit\.udp\.cl/i.test(url) && /practica/i.test(url);
  const reemplazo = esPaginaDePracticas
    ? "practicas_eit@mail.udp.cl"
    : "(correo disponible en el sitio oficial)";

  return text
    .replace(/\[email&#160;protected\]/gi, reemplazo)
    .replace(/\[email\s+protected\]/gi, reemplazo);
}

/**
 * Aviso que reemplaza al contexto cuando la búsqueda no recuperó documentos.
 *
 * Antes, sin documentos, simplemente no se agregaba nada al prompt, y el modelo
 * interpretaba ese silencio como permiso para responder de memoria: así aparecieron
 * un monto y un teléfono de JUNAEB inventados en una respuesta sobre la TNE.
 * Decirle explícitamente que no hay respaldo es más efectivo que no decirle nada.
 */
const SIN_CONTEXTO_AVISO = `

## NO HAY INFORMACIÓN OFICIAL PARA ESTA CONSULTA

La búsqueda no recuperó ningún documento oficial que responda esta pregunta.

Por lo tanto NO tienes respaldo para dar procedimientos, requisitos, montos, plazos,
teléfonos ni pasos de trámite. No los completes de memoria: para esta consulta, no
existen.

Puedes usar únicamente los datos de contacto listados más arriba. Para todo lo demás,
di con naturalidad que no cuentas con esa información y deriva a Secretaría de
Estudios (ximena.geoffroy@udp.cl) o al sitio oficial https://eit.udp.cl

`;

export function buildContext(docs) {
  if (!docs || docs.length === 0) return SIN_CONTEXTO_AVISO;
  const uniqueUrls = new Set();
  const filtered = docs.filter((d) => {
    if (!d.url || uniqueUrls.has(d.url)) return false;
    uniqueUrls.add(d.url);
    return true;
  });

  const parts = filtered.map((d, i) => {
    const rawContent = cleanEmailObfuscation(d.contenido || "", d.url).slice(0, 1200);
    const safeContent = rawContent
      .replace(/<[^>]*>/g, " ")
      .replace(/(\n\s*){3,}/g, "\n\n")
      .trim();

    return `### Documento ${i + 1}: ${d.titulo || "Sin título"}
URL: ${d.url}
${safeContent}`;
  });

  return `\n\n## CONTEXTO OFICIAL VERIFICADO DE LA EIT UDP:\n${parts.join("\n\n---\n\n")}\n\n`;
}

export async function getUrgentNotices() {
  const { url, key } = supabaseEnv();
  if (!url || !key) return "";
  try {
    const now = new Date().toISOString();
    const res = await fetch(
      `${url}/rest/v1/avisos_urgentes?select=titulo,mensaje,tipo,created_at&activo=eq.true&or=(valido_hasta.is.null,valido_hasta.gt.${now})&order=created_at.desc&limit=3`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!res.ok) return "";
    const avisos = await res.json();
    if (!Array.isArray(avisos) || avisos.length === 0) return "";
    const lines = avisos.map((a) => `- [${a.tipo.toUpperCase()}] ${a.titulo}: ${a.mensaje}`);
    return `\n\n## AVISOS URGENTES Y ACTUALES:\n${lines.join("\n")}\n\n`;
  } catch {
    return "";
  }
}

export async function buildSystemPrompt(lastUserMessage, recentHistory = []) {
  let foundDocs = [];
  let ragContext = "";

  if (lastUserMessage) {
    try {
      const initialEmbedding = await embedText(lastUserMessage);
      foundDocs = await searchDocs(initialEmbedding, 5, DEFAULT_MATCH_THRESHOLD);

      if (foundDocs.length === 0 && shouldRewrite(lastUserMessage)) {
        const rewritten = await rewriteQuery(lastUserMessage);
        if (rewritten !== lastUserMessage) {
          const secondEmbedding = await embedText(rewritten);
          foundDocs = await searchDocs(secondEmbedding, 5, DEFAULT_MATCH_THRESHOLD);
        }
      }

      // buildContext() se llama SIEMPRE, con o sin documentos: sin ellos devuelve
      // el aviso explícito de que no hay respaldo. Antes esta rama solo corría con
      // documentos y el prompt quedaba sin mención alguna del tema, silencio que el
      // modelo tomaba como permiso para responder de memoria.
      const reranked = foundDocs.length > 0 ? rerankDocs(foundDocs, lastUserMessage) : [];
      ragContext = buildContext(reranked.slice(0, 3));
    } catch (e) {
      console.error("[RAG] Error al buscar contexto:", e.message);
      // Un fallo de búsqueda no es lo mismo que "no hay nada", pero para el modelo
      // la instrucción correcta es la misma: no inventar.
      ragContext = buildContext([]);
    }
  }

  const notices = await getUrgentNotices();
  return { systemPrompt: `${SYSTEM_PROMPT_EIT}${ragContext}${notices}`, foundDocs };
}

// ─── Generación en Streaming (Gemini / Ollama) ───────────────────────────────

export async function streamGemini({ messages, systemPrompt, config, onChunk }) {
  const key = config.geminiKey;
  if (!key) throw new Error("GEMINI_API_KEY no configurada");
  const model = config.geminiModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.2,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error (${res.status}): ${err.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;
      try {
        const json = JSON.parse(jsonStr);
        const t = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (t) {
          full += t;
          onChunk(t);
        }
      } catch {
        /* chunk parcial */
      }
    }
  }
  return full;
}

export async function streamOllama({ messages, systemPrompt, baseUrl, model, onChunk }) {
  const url = `${baseUrl}/api/chat`;
  const formattedMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || "qwen2.5:7b",
      messages: formattedMessages,
      stream: true,
      keep_alive: -1,
      options: {
        // La entrada típica (system prompt ~2.000 tok + 3 chunks RAG ~2.950 +
        // historial ~900) suma ~5.900 tokens y desbordaba los 4096 anteriores.
        // Al desbordar, llama.cpp descarta tokens del inicio de la ventana, que
        // es justo donde va el system prompt: el modelo perdía sus reglas y
        // empezaba a responder cualquier cosa. Llama 3.1 soporta 128k; 8192 da
        // margen sin inflar la caché KV en las GPU del servidor.
        num_ctx: 8192,

        // Techo de salida. Sin esto la generación es ilimitada hasta el timeout
        // de 90 s, que es como se producen las respuestas que se van en divagues.
        num_predict: 800,

        temperature: 0.15,

        // Recorta la cola de la distribución. Con temperatura baja pero sin
        // top_p/top_k, un token improbable igual puede colarse y descarrilar el
        // resto de la respuesta, porque cada token condiciona los siguientes.
        top_p: 0.9,
        top_k: 40,

        // Los modelos de 8B tienden a entrar en bucle cuando el contexto no
        // alcanza para responder; esto corta la repetición.
        repeat_penalty: 1.15,

        // Llama 3.1 tiende a seguir la conversación sola e inventar turnos del
        // usuario. Estas secuencias cortan la generación si empieza a hacerlo.
        stop: ["\nUsuario:", "\nEstudiante:", "\nPregunta:", "\nUser:"],
      },
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama error (HTTP ${res.status}): ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const json = JSON.parse(trimmed);
        const t = json.message?.content;
        if (t) {
          full += t;
          onChunk(t);
        }
      } catch {
        /* fragmento parcial JSON */
      }
    }
  }
  return full;
}

export async function streamAI({ messages, systemPrompt, onChunk }) {
  const config = getAIConfig();
  if (config.provider === "gemini") {
    return await streamGemini({ messages, systemPrompt, config, onChunk });
  }
  return await streamOllama({
    messages,
    systemPrompt,
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
    onChunk,
  });
}

// ─── Analítica: registro de preguntas ─────────────────────────────────────────
const MAX_LOGGED_QUESTION_LENGTH = 500;

export async function logQuestion({ pregunta, conContexto }) {
  const { url, key } = supabaseEnv();
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/preguntas_log`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        pregunta: (pregunta || "").trim().slice(0, MAX_LOGGED_QUESTION_LENGTH),
        con_contexto: !!conContexto,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // La analítica nunca debe romper el chat
  }
}
