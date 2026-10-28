import type { Article } from "./types";

const STOPWORDS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "um", "uma",
  "para", "por", "com", "que", "meu", "minha", "nao", "esta", "estou", "ta", "tá", "se", "ao", "como", "qual",
  "eu", "me", "mais", "ja", "desde", "ontem", "hoje", "aparece", "preciso",
]);

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ");

const tokens = (s: string): string[] => normalize(s).split(/\s+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));

export type ArticleMatch = {
  article: Article;
  score: number;
  matchedTerms: string[];
};

export function searchArticles(articles: Article[], query: string, limit = 3): ArticleMatch[] {
  const queryTerms = [...new Set(tokens(query))];
  if (queryTerms.length === 0) return [];

  return articles
    .map((article) => {
      const titleTerms = new Set(tokens(article.title));
      const tagTerms = new Set(article.tags.flatMap(tokens));
      const bodyTerms = new Set(tokens(article.body));
      const matched: string[] = [];
      let score = 0;
      for (const term of queryTerms) {
        const weight = (titleTerms.has(term) ? 3 : 0) + (tagTerms.has(term) ? 3 : 0) + (bodyTerms.has(term) ? 1 : 0);
        if (weight > 0) {
          score += weight;
          matched.push(term);
        }
      }
      return { article, score, matchedTerms: matched };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
