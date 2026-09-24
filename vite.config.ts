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

// La Content-Security-Policy de las páginas NO va acá: la fija src/server.ts con
// un nonce por petición (script-src 'nonce-…'), y un header de routeRules la
// reemplazaría por una versión sin script-src. Se verificó con curl.
const framedDeniedHeaders = {
  ...baseSecurityHeaders,
  "X-Frame-Options": "DENY",
};

const routeRules = {
  // Baseline para todo (incluye /api/*): nunca hacer sniffing de contenido,
  // no filtrar la URL completa como referrer, sin permisos de cámara/mic/geo.
  "/**": { headers: baseSecurityHeaders },
  // Páginas normales: no deben poder embeberse en un iframe de otro sitio.
  "/": { headers: framedDeniedHeaders },
  // El panel de admin nunca debe embeberse.
  "/admin": { headers: framedDeniedHeaders },
  // Las respuestas de la API no deben quedar cacheadas por proxies o el
  // navegador: /api/admin-stats devuelve datos del panel.
  "/api/**": {
    headers: {
      ...baseSecurityHeaders,
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
      "Cache-Control": "no-store, max-age=0",
    },
  },
  // /widget se embebe solo desde dominios UDP: lo controla frame-ancestors en la
  // CSP que arma src/server.ts (sin X-Frame-Options, que no admite listas).
  "/widget": { headers: baseSecurityHeaders },
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
