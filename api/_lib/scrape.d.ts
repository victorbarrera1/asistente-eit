type ScrapePage = { url: string; escuela: string; seccion: string; titulo: string };

export const PAGES: ScrapePage[];
export function scrapePage(
  page: ScrapePage,
  options?: { log?: (message: string) => void },
): Promise<number>;
