import { createFileRoute } from "@tanstack/react-router";
import { handleChatRequest } from "../../api/_lib/chat-http.js";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => handleChatRequest(request),
    },
  },
});
