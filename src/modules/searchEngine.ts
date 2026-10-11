import type { AuthorSearchResult, MatchingMode } from "./authorSearch";

declare const Zotero: any;

export interface AuthorSearchOptions {
  isCancelled?: () => boolean;
  onProgress?: (processed: number, total: number) => void;
  match: (author: any, candidate: any, mode: MatchingMode) => boolean;
  affiliation: (item: any, candidate: any) => string;
}

const BATCH_SIZE = 100;
const surname = (creator: any): string =>
  String(creator.lastName || "")
    .trim()
    .toLowerCase();

/**
 * Query the union of authors once, then load each candidate at most once.
 * Matching retains the factory's exact-surname prerequisite and mode rules.
 * Cancellation discards partial results; an active native database query cannot
 * be interrupted, but no further batches are loaded after it resolves.
 */
export async function collectAuthorResults(
  original: any,
  creators: any[],
  mode: MatchingMode,
  options: AuthorSearchOptions,
): Promise<AuthorSearchResult[]> {
  const cancelled = options.isCancelled || (() => false);
  if (cancelled()) return [];
  const authors = creators.filter((creator) => surname(creator));
  if (!authors.length) return [];

  const queryNames = new Map<string, string>();
  for (const author of authors) {
    queryNames.set(surname(author), String(author.lastName).trim());
  }
  const search = new Zotero.Search();
  search.libraryID = original.libraryID;
  search.addCondition("joinMode", "any");
  for (const name of queryNames.values()) {
    search.addCondition("creator", "contains", name);
  }
  // Yield before starting the database work so the progress window can paint.
  await Zotero.Promise.delay(0);
  if (cancelled()) return [];
  const found: number[] = await search.search();
  if (cancelled()) return [];
  const ids = Array.from(new Set(found)).filter((id) => id !== original.id);
  options.onProgress?.(0, ids.length);

  const results: AuthorSearchResult[] = [];
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    if (cancelled()) return [];
    const batch = ids.slice(offset, offset + BATCH_SIZE);
    const items: any[] = await Zotero.Items.getAsync(batch);
    if (cancelled()) return [];
    for (const item of items) {
      if (cancelled()) return [];
      if (
        !item?.isRegularItem() ||
        item.deleted ||
        item.libraryID !== original.libraryID ||
        item.id === original.id
      )
        continue;
      const candidates = new Map<string, any[]>();
      for (const candidate of item.getCreators()) {
        const key = surname(candidate);
        if (!queryNames.has(key)) continue;
        const group = candidates.get(key) || [];
        group.push(candidate);
        candidates.set(key, group);
      }
      const matchedAuthors = new Set<string>();
      const affiliations = new Set<string>();
      // Source-author order matches the previous per-author search behavior.
      for (const author of authors) {
        for (const candidate of candidates.get(surname(author)) || []) {
          if (!options.match(author, candidate, mode)) continue;
          matchedAuthors.add(
            `${candidate.lastName} ${candidate.firstName || ""}`.trim(),
          );
          const affiliation = options.affiliation(item, candidate);
          if (affiliation) affiliations.add(affiliation);
        }
      }
      if (matchedAuthors.size) {
        results.push({
          item,
          matchedAuthors: Array.from(matchedAuthors),
          affiliations: Array.from(affiliations),
        });
      }
    }
    options.onProgress?.(
      Math.min(offset + batch.length, ids.length),
      ids.length,
    );
    // A timer yields even when Zotero has cached every item in this batch.
    await Zotero.Promise.delay(0);
  }
  return cancelled() ? [] : results;
}
