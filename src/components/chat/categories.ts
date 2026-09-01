/**
 * Datos del sidebar y sugerencias del chat.
 * Para agregar una categoría/pregunta/documento nuevo, edita solo este archivo.
 */
import {
  BookOpen,
  GraduationCap,
  FileText,
  ClipboardList,
  FlaskConical,
  Scale,
  Award,
  Wrench,
  HeartPulse,
  Calendar,
  type LucideIcon,
} from "lucide-react";

export const SUGGESTIONS = [
  { label: "Requisitos de Práctica I", icon: BookOpen },
  { label: "Proceso de titulación", icon: Award },
  { label: "Reglamentos de la EIT", icon: Scale },
  { label: "Formulario de solicitud de práctica", icon: FileText },
  { label: "Postulación a ayudantías", icon: ClipboardList },
  { label: "Laboratorio EIT", icon: FlaskConical },
];

export interface DocItem {
  name: string;
  url: string;
}

export interface Subsection {
  title: string;
  type: "questions" | "docs";
  items: string[] | DocItem[];
}

export interface HelpCategory {
  label: string;
  icon: LucideIcon;
  subsections: Subsection[];
}

export interface TopicQuestion {
  label: string;
  question: string;
}

export interface PrimaryTopic {
  label: string;
  description: string;
  icon: LucideIcon;
  questions: TopicQuestion[];
}

/**
 * Navegación principal del chat. Estas cuatro categorías se muestran junto al
 * título del asistente y despliegan consultas breves dentro del panel central.
 */
export const PRIMARY_TOPICS: PrimaryTopic[] = [
  {
    label: "Prácticas",
    description: "Revisa requisitos, fechas, búsqueda de empresas y trámites de práctica.",
    icon: GraduationCap,
    questions: [
      {
        label: "Fechas y plazos",
        question: "¿Cuáles son las fechas y plazos de práctica?",
      },
      {
        label: "Encontrar una práctica",
        question: "¿Dónde puedo encontrar ofertas o empresas para realizar mi práctica?",
      },
      {
        label: "Requisitos de práctica",
        question: "¿Cuáles son los requisitos para Práctica I y Práctica Profesional?",
      },
      {
        label: "Formulario y seguro",
        question:
          "¿Cómo solicito el formulario de práctica y qué debo hacer con el seguro escolar?",
      },
    ],
  },
  {
    label: "Titulación",
    description: "Consulta el calendario, la inscripción y los documentos de titulación.",
    icon: Award,
    questions: [
      {
        label: "Fechas de titulación",
        question: "¿Cuáles son las fechas de titulación 2026?",
      },
      {
        label: "Inscribir memoria o taller",
        question: "¿Cómo inscribo mi memoria o taller de título?",
      },
      {
        label: "Formatos y plantillas",
        question: "¿Qué formatos y plantillas debo usar para la memoria o taller de título?",
      },
      {
        label: "Después de la defensa",
        question: "¿Cuál es el proceso administrativo después de la defensa?",
      },
    ],
  },
  {
    label: "Reglamentos",
    description: "Encuentra rápidamente las normas y políticas más consultadas de la EIT.",
    icon: Scale,
    questions: [
      {
        label: "Reglamentos EIT",
        question: "¿Dónde encuentro los reglamentos de la EIT?",
      },
      {
        label: "Reglamento de prácticas",
        question: "¿Dónde encuentro y qué establece el reglamento de prácticas?",
      },
      {
        label: "Reglamento de titulación",
        question: "¿Dónde encuentro y qué establece el reglamento de titulación?",
      },
      {
        label: "Préstamo de equipos",
        question: "¿Cuál es el reglamento de préstamo de equipos?",
      },
    ],
  },
  {
    label: "Laboratorio",
    description: "Revisa acceso, normas, equipos y herramientas disponibles en la EIT.",
    icon: FlaskConical,
    questions: [
      {
        label: "Acceso al laboratorio",
        question: "¿Cómo accedo al laboratorio EIT?",
      },
      {
        label: "Normas de uso",
        question: "¿Cuál es el reglamento del laboratorio?",
      },
      {
        label: "Préstamo de equipos",
        question: "¿Cómo solicito el préstamo de equipos portátiles?",
      },
      {
        label: "Software disponible",
        question: "¿Qué herramientas académicas y software puedo usar en la EIT?",
      },
    ],
  },
];

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    label: "Prácticas",
    icon: GraduationCap,
    subsections: [
      {
        title: "Documentación Oficial",
        type: "docs",
        items: [
          {
            name: "Formulario de Solicitud (Word)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2025/12/FormularioPracticas2024.docx",
          },
          {
            name: "Guía de Prácticas (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2021/12/practicas-guia-1.pdf",
          },
          {
            name: "Reglamento de Prácticas FIC (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2021/12/Anexo-N%C2%B05.10-Reglamento-de-practicas.pdf",
          },
          {
            name: "Plantillas Informe Práctica (ZIP)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2023/04/plantillas-1.zip",
          },
          {
            name: "Charla Prácticas 2025 (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2025/08/CharlaPracticas06082025.pdf",
          },
        ],
      },
      {
        title: "Práctica I y Profesional",
        type: "questions",
        items: [
          "¿Cuáles son los requisitos para Práctica I?",
          "¿Cuáles son los requisitos para Práctica Profesional?",
          "¿Cuánto duran las prácticas?",
        ],
      },
      {
        title: "Trámites y Seguro",
        type: "questions",
        items: [
          "¿Cómo solicito mi formulario de práctica?",
          "¿Cuáles son las fechas y plazos de práctica?",
          "¿Qué pasa con el seguro escolar en prácticas?",
        ],
      },
    ],
  },
  {
    label: "Titulación",
    icon: Award,
    subsections: [
      {
        title: "Reglamentos y Calendario",
        type: "docs",
        items: [
          {
            name: "Reglamento de Titulación (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2021/12/Anexo-No5.11-Reglamento-de-titulacion-1.pdf",
          },
          {
            name: "Calendario Titulación 1-2026 (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2026/03/Fechas-titulacion-2026-1-2.pdf",
          },
          {
            name: "Solicitud Plan de Titulación (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2025/08/Solicitud-plan-de-titulaci%C3%B3n-2025-8-22.pdf",
          },
          {
            name: "Proceso Post Defensa (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2025/11/Proceso-de-Obtencion-Certificados-de-pre-y-posgrado-1.pdf",
          },
        ],
      },
      {
        title: "Formatos y Plantillas",
        type: "docs",
        items: [
          {
            name: "Inscripción Memoria/Taller (Word)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2024/11/INSCRIPCION-DE-MEMORIA-DE-TITULO-INF.docx",
          },
          {
            name: "Formato Memoria/Taller (ZIP)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2023/08/tesis-udp.zip",
          },
          {
            name: "Formato LaTeX Anteproyecto (ZIP)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2024/08/Formato-Anteproyecto_EIT.zip",
          },
          {
            name: "Rúbrica Memoria (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2021/12/rubrica-pregrado.pdf",
          },
          {
            name: "Rúbrica Taller (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2021/12/rubrica-taller.pdf",
          },
          {
            name: "Carta Compromiso Empresa (Word)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2023/04/Carta_Compromiso_Empresa.docx",
          },
        ],
      },
      {
        title: "Inscripción y Proceso",
        type: "questions",
        items: [
          "¿Cuál es el proceso de titulación?",
          "¿Cuáles son las fechas de titulación 2026?",
          "¿Cómo inscribo mi memoria o taller de título?",
        ],
      },
      {
        title: "Evaluación y Formato",
        type: "questions",
        items: [
          "¿Qué formatos debo usar para la memoria?",
          "¿Cuáles son las rúbricas de evaluación?",
          "¿Cuál es el proceso administrativo post defensa?",
        ],
      },
    ],
  },
  {
    label: "Reglamentos",
    icon: Scale,
    subsections: [
      {
        title: "Documentación",
        type: "docs",
        items: [
          {
            name: "Reglamento Préstamo Equipos (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2021/12/reglamento.pdf",
          },
        ],
      },
      {
        title: "Preguntas Frecuentes",
        type: "questions",
        items: [
          "¿Dónde encuentro los reglamentos de la EIT?",
          "¿Cuál es el reglamento de préstamo de equipos?",
          "¿Dónde veo las becas y beneficios disponibles?",
        ],
      },
    ],
  },
  {
    label: "Laboratorio",
    icon: FlaskConical,
    subsections: [
      {
        title: "Preguntas Frecuentes",
        type: "questions",
        items: [
          "¿Cómo accedo al laboratorio EIT?",
          "¿Cuál es el reglamento del laboratorio?",
          "¿Cómo solicito préstamo de equipos portátiles?",
        ],
      },
    ],
  },
  {
    label: "Ayudantías",
    icon: ClipboardList,
    subsections: [
      {
        title: "Documentación",
        type: "docs",
        items: [
          {
            name: "Política de Ayudantías (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2021/12/Anexo-N%C2%B05.9-Pol%C3%ADtica-General-sobre-Ayudant%C3%ADas.pdf",
          },
        ],
      },
      {
        title: "Postulación y Requisitos",
        type: "questions",
        items: [
          "¿Cómo postulo a una ayudantía?",
          "¿Cuáles son los requisitos para ser ayudante?",
          "¿Cuál es la política general de ayudantías?",
        ],
      },
    ],
  },
  {
    label: "Herramientas",
    icon: Wrench,
    subsections: [
      {
        title: "Manuales de Instalación",
        type: "docs",
        items: [
          {
            name: "Manual MATLAB (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2021/12/matlab-instalacion-y-activacion-de-licencia.pdf",
          },
          {
            name: "Manual Azure (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2021/12/Mazure.pdf",
          },
          {
            name: "Manual Bizagi (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2021/12/Bizagi-Process-Modeler.pdf",
          },
          {
            name: "IBM Academic Initiative (PDF)",
            url: "https://eit.udp.cl/cms/wp-content/uploads/2021/12/IBM_Academic_Initiative.pdf",
          },
        ],
      },
      {
        title: "Preguntas Frecuentes",
        type: "questions",
        items: [
          "¿Qué herramientas académicas ofrece la EIT?",
          "¿Cómo instalo MATLAB con licencia UDP?",
          "¿Cómo accedo a Canvas LMS?",
          "¿Cómo uso la plataforma Docencia EIT?",
        ],
      },
    ],
  },
  {
    label: "Bienestar Estudiantil",
    icon: HeartPulse,
    subsections: [
      {
        title: "Enlaces y Agenda DAE",
        type: "docs",
        items: [
          {
            name: "🗓 Agendar hora con Psicólogo UDP",
            url: "https://agendaelectronica.udp.cl/atencion-psicologica-individual/",
          },
          {
            name: "Atención Psicológica Individual",
            url: "https://dae.udp.cl/salud-mental-estudiantil/atencion-individual/",
          },
          {
            name: "Salud Mental Estudiantil",
            url: "https://dae.udp.cl/salud-mental-estudiantil/",
          },
          {
            name: "Becas y Beneficios Estudiantiles",
            url: "https://dae.udp.cl/bienestar-estudiantil/orientacion-y-beneficios-estudiantiles/",
          },
          {
            name: "Atención y Orientación Social",
            url: "https://dae.udp.cl/bienestar-estudiantil/atencion-y-orientacion-social/",
          },
        ],
      },
      {
        title: "Salud Mental",
        type: "questions",
        items: [
          "¿Cómo agendo hora con el psicólogo de la UDP?",
          "¿Qué servicios ofrece el DAE para los estudiantes?",
        ],
      },
      {
        title: "Becas y Gratuidad",
        type: "questions",
        items: [
          "¿Qué becas y beneficios puedo solicitar como estudiante UDP?",
          "¿Cómo hago la evaluación socioeconómica en UDP?",
          "¿Qué es la Gratuidad y cómo sé si la tengo?",
        ],
      },
      {
        title: "Trámites Generales",
        type: "questions",
        items: ["¿Dónde solicito la Tarjeta Nacional Estudiantil (TNE)?"],
      },
    ],
  },
  {
    label: "Calendario Académico",
    icon: Calendar,
    subsections: [
      {
        title: "Fechas Clave",
        type: "questions",
        items: [
          "¿Cuándo empiezan las clases del semestre?",
          "¿Cuáles son las fechas de exámenes del semestre?",
          "¿Cuándo es el periodo de toma de ramos?",
          "¿Cuándo es la semana de receso o vacaciones escolares?",
        ],
      },
      {
        title: "Enlaces Oficiales",
        type: "docs",
        items: [
          {
            name: "Calendario Académico General (Sitio Web)",
            url: "https://www.udp.cl/calendario-academico/",
          },
          {
            name: "Portal de Estudiantes UDP",
            url: "https://estudiantes.udp.cl",
          },
        ],
      },
    ],
  },
];
