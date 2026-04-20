/**
 * Common documents shared across every trip — passports, visas, insurance.
 *
 * Files live in the private `documents` Supabase Storage bucket under a
 * fixed `common/` prefix. They are not rows in the `documents` table
 * (which requires a trip_id), just objects in Storage. The seed endpoint
 * `/api/admin/seed/common-docs` uploads the binaries from
 * `src/seed/common-docs/` into Storage; the `/passports` page signs the
 * paths on the fly.
 */

export type CommonDocKind = "passport";

export type CommonDoc = {
  id: string;
  kind: CommonDocKind;
  /** Display title. */
  title: string;
  /** Owner (who holds the document). */
  owner: "Кирилл" | "Марина";
  /** Passport number, shown as meta. */
  number: string;
  /** Path to the source file in `src/seed/common-docs/`. */
  seedFile: string;
  /** Download filename shown in the browser. */
  downloadFilename: string;
  /** Storage path inside the `documents` bucket. */
  storagePath: string;
};

export const COMMON_DOCS_STORAGE_PREFIX = "common";

export const COMMON_DOCS: CommonDoc[] = [
  {
    id: "passport-kirill",
    kind: "passport",
    title: "Загранпаспорт",
    owner: "Кирилл",
    number: "77 5381933",
    seedFile: "trubitsyn-kirill.pdf",
    downloadFilename: "Trubitsyn Kirill 775381933.pdf",
    storagePath: `${COMMON_DOCS_STORAGE_PREFIX}/trubitsyn-kirill.pdf`,
  },
  {
    id: "passport-marina",
    kind: "passport",
    title: "Загранпаспорт",
    owner: "Марина",
    number: "77 7687306",
    seedFile: "braesecke-marina.pdf",
    downloadFilename: "Braesecke Marina 777687306.pdf",
    storagePath: `${COMMON_DOCS_STORAGE_PREFIX}/braesecke-marina.pdf`,
  },
];

export function findCommonDoc(id: string): CommonDoc | null {
  return COMMON_DOCS.find((d) => d.id === id) ?? null;
}
