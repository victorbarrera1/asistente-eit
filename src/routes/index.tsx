import { createFileRoute } from "@tanstack/react-router";
import { UdpChat } from "@/components/UdpChat";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Asistente EIT UDP — Escuela de Informática y Telecomunicaciones" },
      {
        name: "description",
        content:
          "Asistente virtual de la Escuela de Informática y Telecomunicaciones (EIT) de la Universidad Diego Portales. Prácticas, titulación, reglamentos, laboratorio y más.",
      },
      { property: "og:title", content: "Asistente EIT UDP" },
      {
        property: "og:description",
        content:
          "Asistente virtual con información oficial verificada de la EIT UDP. Resuelve tus dudas sobre prácticas, titulación, reglamentos y más.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <UdpChat />;
}
