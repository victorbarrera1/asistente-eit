import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  TrendingUp,
  Lock,
  LogOut,
  RefreshCw,
  Star,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Asistente EIT UDP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

interface DailyUsage {
  date: string;
  count: number;
}

interface TopQuestion {
  question: string;
  count: number;
}

interface Satisfaction {
  positive: number;
  negative: number;
  total: number;
  rate: number;
}

interface NegativeFeedback {
  pregunta: string;
  respuesta: string;
  comentario: string;
  created_at: string;
}

interface GeneralComment {
  rating: number;
  comentario: string;
  created_at: string;
}

interface GeneralFeedbackData {
  avgRating: number;
  totalCount: number;
  distribution: number[];
  comments: GeneralComment[];
}

interface AdminStats {
  totalQuestions: number;
  dailyUsage: DailyUsage[];
  topQuestions: TopQuestion[];
  satisfaction: Satisfaction;
  coverageGaps: string[];
  recentNegativeFeedback: NegativeFeedback[];
  generalFeedback: GeneralFeedbackData;
}

function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "questions" | "feedback" | "satisfaction" | "gaps"
  >("overview");

  useEffect(() => {
    void fetchStats({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(pwd: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: pwd }),
      });
      if (res.status === 401) {
        setError("Contraseña incorrecta");
        setAuthenticated(false);
        return;
      }
      if (res.status === 429) {
        setError("Demasiados intentos. Intenta de nuevo en unos minutos.");
        return;
      }
      if (!res.ok) throw new Error("Error de autenticación");
      setPassword("");
      setAuthenticated(true);
      await fetchStats();
    } catch {
      setError("Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats(opts?: { silent?: boolean }) {
    setLoading(true);
    if (!opts?.silent) setError("");
    try {
      const res = await fetch("/api/admin-stats", {
        method: "GET",
        credentials: "include",
      });
      if (res.status === 401) {
        setAuthenticated(false);
        if (!opts?.silent) setError("Sesión expirada. Vuelve a iniciar sesión.");
        return;
      }
      if (!res.ok) throw new Error("Error fetching stats");
      const data = await res.json();
      setStats(data);
      setAuthenticated(true);
    } catch {
      if (!opts?.silent) setError("Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-udp-canvas px-4">
        <div className="w-full max-w-sm rounded-2xl border border-udp-line bg-udp-surface p-8 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-udp-red/10 text-udp-red">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-serif text-lg font-semibold text-udp-ink">Panel Admin</h1>
              <p className="text-xs text-muted-foreground">Asistente EIT UDP</p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void login(password);
            }}
          >
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña de administrador"
              className="w-full rounded-xl border border-udp-line bg-udp-soft/50 px-4 py-2.5 text-sm text-udp-ink outline-none focus:border-udp-red/40 placeholder:text-muted-foreground"
              autoFocus
            />
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="mt-4 w-full rounded-xl bg-udp-red py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
              {loading ? "Cargando..." : "Acceder"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const TABS = [
    { id: "overview" as const, label: "Resumen", icon: BarChart3 },
    { id: "questions" as const, label: "Preguntas", icon: MessageSquare },
    { id: "feedback" as const, label: "Feedback Chat", icon: ThumbsUp },
    { id: "satisfaction" as const, label: "Calidad (Estrellas)", icon: Star },
    { id: "gaps" as const, label: "Gaps", icon: AlertTriangle },
  ];

  const PIE_COLORS = ["#22c55e", "#ef4444"];

  // Prepare chart data for ratings distribution
  const ratingsDistributionData = [
    { name: "1 ⭐", count: stats.generalFeedback?.distribution?.[0] ?? 0 },
    { name: "2 ⭐", count: stats.generalFeedback?.distribution?.[1] ?? 0 },
    { name: "3 ⭐", count: stats.generalFeedback?.distribution?.[2] ?? 0 },
    { name: "4 ⭐", count: stats.generalFeedback?.distribution?.[3] ?? 0 },
    { name: "5 ⭐", count: stats.generalFeedback?.distribution?.[4] ?? 0 },
  ];

  return (
    <div className="min-h-screen bg-udp-canvas font-sans text-udp-ink">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-udp-line bg-udp-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-udp-red" />
            <h1 className="font-serif text-base font-semibold text-udp-ink">
              Analytics — Asistente EIT
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchStats()}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-udp-line bg-udp-soft text-muted-foreground hover:text-udp-ink cursor-pointer"
              title="Actualizar datos"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => {
                void fetch("/api/admin-logout", { method: "POST", credentials: "include" });
                setAuthenticated(false);
                setStats(null);
                setPassword("");
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-udp-line bg-udp-soft text-muted-foreground hover:text-udp-ink cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-xl border border-udp-line bg-udp-soft/50 p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === id
                  ? "bg-udp-surface text-udp-ink shadow-[var(--shadow-soft)]"
                  : "text-muted-foreground hover:text-udp-ink"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Stats Cards */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <StatCard label="Total Preguntas" value={stats.totalQuestions} icon={MessageSquare} />
              <StatCard
                label="Feedback Respuestas"
                value={stats.satisfaction.total}
                icon={ThumbsUp}
              />
              <StatCard
                label="Tasa Utilidad"
                value={`${stats.satisfaction.rate}%`}
                icon={TrendingUp}
                accent={stats.satisfaction.rate >= 70}
              />
              <StatCard
                label="Valoración General"
                value={`${stats.generalFeedback?.avgRating ?? 0} ⭐`}
                icon={Star}
                accent={(stats.generalFeedback?.avgRating ?? 0) >= 4.0}
              />
              <StatCard
                label="Gaps de Contexto"
                value={stats.coverageGaps.length}
                icon={AlertTriangle}
                warning={stats.coverageGaps.length > 10}
              />
            </div>

            {/* Daily Usage Chart */}
            <div className="rounded-2xl border border-udp-line bg-udp-surface p-5 shadow-[var(--shadow-soft)]">
              <h2 className="mb-4 text-sm font-semibold text-udp-ink">
                Uso Diario (últimos 30 días)
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.dailyUsage}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.55 0.23 28)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="oklch(0.55 0.23 28)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }}
                      tickFormatter={(d: string) => d.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "0.75rem",
                        border: "1px solid oklch(0.9 0 0)",
                        fontSize: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="oklch(0.55 0.23 28)"
                      strokeWidth={2}
                      fill="url(#colorCount)"
                      name="Preguntas"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Satisfaction Pie */}
            <div className="rounded-2xl border border-udp-line bg-udp-surface p-5 shadow-[var(--shadow-soft)]">
              <h2 className="mb-4 text-sm font-semibold text-udp-ink">
                Satisfacción por Respuestas Útiles
              </h2>
              <div className="flex items-center gap-8">
                <div className="h-40 w-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Positivo", value: stats.satisfaction.positive },
                          { name: "Negativo", value: stats.satisfaction.negative },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={65}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {PIE_COLORS.map((color, idx) => (
                          <Cell key={idx} fill={color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-emerald-500" />
                    <span className="text-sm text-udp-ink">
                      Positivo (Útil): {stats.satisfaction.positive}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500" />
                    <span className="text-sm text-udp-ink">
                      Negativo (No útil): {stats.satisfaction.negative}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top Questions */}
        {activeTab === "questions" && (
          <div className="rounded-2xl border border-udp-line bg-udp-surface p-5 shadow-[var(--shadow-soft)]">
            <h2 className="mb-4 text-sm font-semibold text-udp-ink">
              Preguntas Más Frecuentes ({stats.topQuestions.length})
            </h2>
            <div className="flex flex-col divide-y divide-udp-line/50">
              {stats.topQuestions.map((q, i) => (
                <div key={i} className="flex items-center justify-between py-3 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-udp-soft text-[11px] font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="text-sm text-udp-ink truncate">{q.question}</span>
                  </div>
                  <span className="flex-shrink-0 rounded-full bg-udp-red/10 px-2.5 py-0.5 text-xs font-semibold text-udp-red">
                    {q.count}×
                  </span>
                </div>
              ))}
              {stats.topQuestions.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No hay datos de preguntas todavía
                </p>
              )}
            </div>
          </div>
        )}

        {/* Feedback Chat */}
        {activeTab === "feedback" && (
          <div className="rounded-2xl border border-udp-line bg-udp-surface p-5 shadow-[var(--shadow-soft)]">
            <h2 className="mb-4 text-sm font-semibold text-udp-ink">
              Feedback Negativo de Respuestas (con comentarios)
            </h2>
            <div className="flex flex-col gap-4">
              {stats.recentNegativeFeedback.map((f, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-udp-line bg-udp-soft/30 p-4 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <ThumbsDown className="h-4 w-4 flex-shrink-0 text-red-500 mt-0.5" />
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-semibold text-udp-ink">Pregunta del alumno:</p>
                      <p className="text-sm text-muted-foreground">{f.pregunta}</p>
                    </div>
                  </div>
                  {f.comentario && (
                    <div className="ml-6 rounded-lg bg-red-50 dark:bg-red-950/20 px-3 py-2">
                      <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                        Comentario:
                      </p>
                      <p className="text-sm text-red-700 dark:text-red-300">{f.comentario}</p>
                    </div>
                  )}
                  <p className="ml-6 text-[10px] text-muted-foreground">
                    {new Date(f.created_at).toLocaleDateString("es-CL", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))}
              {stats.recentNegativeFeedback.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No hay feedback negativo con comentarios todavía 🎉
                </p>
              )}
            </div>
          </div>
        )}

        {/* Tab Calidad (Estrellas) */}
        {activeTab === "satisfaction" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Average and total count */}
              <div className="rounded-2xl border border-udp-line bg-udp-surface p-6 shadow-[var(--shadow-soft)] flex flex-col justify-center items-center text-center">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Calificación Promedio
                </span>
                <span className="text-6xl font-extrabold text-udp-ink mb-2">
                  {stats.generalFeedback?.avgRating ?? 0}
                </span>
                <div className="flex gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-5 w-5 ${
                        star <= Math.round(stats.generalFeedback?.avgRating ?? 0)
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/35"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  Basado en {stats.generalFeedback?.totalCount ?? 0} valoraciones totales
                </span>
              </div>

              {/* Distribution Chart */}
              <div className="rounded-2xl border border-udp-line bg-udp-surface p-6 shadow-[var(--shadow-soft)] md:col-span-2">
                <h3 className="text-sm font-semibold text-udp-ink mb-4">
                  Distribución de Puntuaciones
                </h3>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={ratingsDistributionData}
                      layout="vertical"
                      margin={{ top: 0, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="oklch(0.9 0 0)"
                      />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tick={{ fontSize: 11, fontWeight: "bold" }}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "0.75rem",
                          border: "1px solid oklch(0.9 0 0)",
                          fontSize: "12px",
                        }}
                      />
                      <Bar
                        dataKey="count"
                        fill="oklch(0.79 0.17 80)"
                        radius={[0, 4, 4, 0]}
                        name="Votos"
                      >
                        {ratingsDistributionData.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={idx === 4 ? "oklch(0.62 0.21 27)" : "oklch(0.79 0.17 80)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* General comments */}
            <div className="rounded-2xl border border-udp-line bg-udp-surface p-5 shadow-[var(--shadow-soft)]">
              <h3 className="mb-4 text-sm font-semibold text-udp-ink">
                Sugerencias y Comentarios de Calidad Recientes
              </h3>
              <div className="flex flex-col gap-3">
                {stats.generalFeedback?.comments?.map((c, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-udp-line bg-udp-soft/20 p-4 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-3.5 w-3.5 ${
                              star <= c.rating
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/25"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("es-CL", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-udp-ink leading-relaxed">{c.comentario}</p>
                  </div>
                ))}
                {(!stats.generalFeedback?.comments ||
                  stats.generalFeedback.comments.length === 0) && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No hay comentarios generales de calidad todavía.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Coverage Gaps */}
        {activeTab === "gaps" && (
          <div className="rounded-2xl border border-udp-line bg-udp-surface p-5 shadow-[var(--shadow-soft)]">
            <h2 className="mb-2 text-sm font-semibold text-udp-ink">
              Preguntas Sin Contexto RAG ({stats.coverageGaps.length})
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Estas preguntas no encontraron documentos relevantes en Supabase. Considera agregar
              contenido sobre estos temas.
            </p>
            <div className="flex flex-col divide-y divide-udp-line/50">
              {stats.coverageGaps.map((q, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                  <span className="text-sm text-udp-ink">{q}</span>
                </div>
              ))}
              {stats.coverageGaps.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Todas las preguntas recientes encontraron contexto ✅
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  warning,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-udp-line bg-udp-surface p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className={`h-4 w-4 ${
            warning ? "text-amber-500" : accent ? "text-emerald-500" : "text-udp-red"
          }`}
        />
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
      <span
        className={`text-2xl font-bold ${
          warning ? "text-amber-600" : accent ? "text-emerald-600" : "text-udp-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
