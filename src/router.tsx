import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  // Nonce CSP de la petición en curso (lo define src/server.ts). En el cliente
  // no existe y TanStack lo lee del <meta property="csp-nonce"> que emite HeadContent.
  const readNonce = (globalThis as { __EIT_CSP_NONCE__?: () => string | undefined })
    .__EIT_CSP_NONCE__;

  const router = createRouter({
    routeTree,
    context: { queryClient },
    ssr: { nonce: readNonce?.() },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
