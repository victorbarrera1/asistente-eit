type ScrapePage = { url: string; escuela: string; seccion: string; titulo: string };
export type ScrapeResult = { chunks: number; estado: "nueva" | "actualizada" | "sin_cambios" };

export const PAGES: ScrapePage[];
export const PIPELINE_VERSION: string;
export function contentHash(text: string, embedModel: string): string;
export function embeddingModelFilter(provider: string, embedModel: string): string;
export function scrapePage(
  page: ScrapePage,
  options?: { log?: (message: string) => void; force?: boolean },
): Promise<ScrapeResult>;
