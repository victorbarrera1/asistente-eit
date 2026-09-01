import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Headers de seguridad HTTP ────────────────────────────────────────────────
// Definidos vía routeRules de Nitro (en vez de vercel.json) para que apliquen
// tanto en el despliegue Vercel (preset "vercel") como en el despliegue Dokku
// (preset "node-server"), ya que ambos pasan por el mismo build de Nitro.
const baseSecurityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  // Fuerza HTTPS en visitas posteriores y corta el downgrade a http:// que
  // permitiría interceptar la cookie de sesión de admin en la red.
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

// Directivas que no dependen de nonces/hashes y por lo tanto no arriesgan
// romper la hidratación de TanStack Start + Vite:
//   object-src 'none'  → sin <object>/<embed> (vector clásico de ejecución)
//   base-uri 'self'    → impide que un <base> inyectado redirija rutas relativas
//   form-action 'self' → impide que un formulario inyectado postee a otro dominio
// script-src/style-src siguen fuera a propósito (requieren nonces; mejora aparte).
const cspBase = "object-src 'none'; base-uri 'self'; form-action 'self'";

const framedDeniedHeaders = {
  ...baseSecurityHeaders,
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": `${cspBase}; frame-ancestors 'none'`,
};

const routeRules = {
  // Baseline para todo (incluye /api/*): nunca hacer sniffing de contenido,
  // no filtrar la URL completa como referrer, sin permisos de cámara/mic/geo.
  "/**": { headers: { ...baseSecurityHeaders, "Content-Security-Policy": cspBase } },
  // Páginas normales: no deben poder embeberse en un iframe de otro sitio.
  "/": { headers: framedDeniedHeaders },
  // El panel de admin nunca debe embeberse: 'self' alcanzaba para que una
  // página del propio sitio lo superpusiera, así que acá va 'none'.
  "/admin": { headers: framedDeniedHeaders },
  // Las respuestas de la API no deben quedar cacheadas por proxies o el
  // navegador: /api/admin-stats devuelve datos del panel.
  "/api/**": {
    headers: {
      ...baseSecurityHeaders,
      "Content-Security-Policy": cspBase,
      "Cache-Control": "no-store, max-age=0",
    },
  },
  // /widget existe para ser embebido, pero `frame-ancestors *` permitía que
  // CUALQUIER sitio lo incrustara y lo presentara como asistente oficial de la
  // UDP dentro de una página falsa. Se acota a los dominios de la universidad.
  "/widget": {
    headers: {
      ...baseSecurityHeaders,
      "Content-Security-Policy": `${cspBase}; frame-ancestors 'self' https://*.udp.cl`,
    },
  },
};

export default defineConfig({
  server: {
    port: 3030,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
      server: { entry: "server" },
    }),
    nitro(
      process.env.VERCEL
        ? {
            preset: "vercel",
            output: {
              dir: ".vercel/output",
              serverDir: ".vercel/output/functions/index.func",
              publicDir: ".vercel/output/static",
            },
            routeRules,
          }
        : {
            preset: "node-server",
            routeRules,
          },
    ),
    viteReact(),
  ],
});
