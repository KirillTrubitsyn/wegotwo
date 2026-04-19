"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsername } from "@/lib/auth/current-user";
import {
  DOCS_BUCKET,
  sha256Hex,
  storagePathFor,
} from "@/lib/docs/storage";
import { extForMime } from "@/lib/docs/labels";

const KINDS = [
  "passport",
  "visa",
  "ticket",
  "booking",
  "insurance",
  "other",
] as const;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

const metaSchema = z.object({
  title: z.string().trim().min(1, "Название обязательно").max(160),
  kind: z.enum(KINDS),
});

export type DocFormErrors = {
  form?: string;
  fields?: {
    title?: string;
    kind?: string;
    file?: string;
  };
};

export type DocActionState =
  | { ok: true }
  | ({ ok: false } & DocFormErrors);

function errState(e: DocFormErrors): DocActionState {
  return { ok: false, ...e };
}

async function resolveTripId(slug: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("trips")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

function extFromFilename(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  if (ext.length === 0 || ext.length > 6) return null;
  return ext;
}

export async function uploadDocumentAction(
  slug: string,
  _prev: DocActionState,
  fd: FormData
): Promise<DocActionState> {
  const username = await getCurrentUsername();
  if (!username) return errState({ form: "Требуется вход" });

  const tripId = await resolveTripId(slug);
  if (!tripId) return errState({ form: "Поездка не найдена" });

  const rawTitle = String(fd.get("title") ?? "").trim();
  const rawKind = String(fd.get("kind") ?? "other");
  const file = fd.get("file");

  const parsed = metaSchema.safeParse({ title: rawTitle, kind: rawKind });
  if (!parsed.success) {
    const fields: DocFormErrors["fields"] = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0] as "title" | "kind";
      if (k && !fields[k]) fields[k] = i.message;
    }
    return errState({ fields });
  }

  if (!(file instanceof File) || file.size === 0) {
    return errState({ fields: { file: "Выберите файл" } });
  }
  if (file.size > MAX_BYTES) {
    return errState({ fields: { file: "Файл больше 25 МБ" } });
  }

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    return errState({
      fields: { file: "Поддерживаются PDF, JPG, PNG, WebP, HEIC" },
    });
  }

  const ab = await file.arrayBuffer();
  const hash = await sha256Hex(ab);

  const admin = createAdminClient();

  // Dedup: same file already in this trip → reject.
  const { data: existing } = await admin
    .from("documents")
    .select("id")
    .eq("trip_id", tripId)
    .eq("content_hash", hash)
    .maybeSingle();
  if (existing) {
    return errState({ fields: { file: "Этот файл уже загружен" } });
  }

  const ext =
    extFromFilename(file.name) ?? extForMime(mime, "bin");
  // crypto.randomUUID is available in Node 20+ and the Next runtime.
  const id =
    typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "";
  if (!id) return errState({ form: "Не удалось сгенерировать id" });

  const storagePath = storagePathFor(tripId, id, ext);

  const up = await admin.storage
    .from(DOCS_BUCKET)
    .upload(storagePath, ab, {
      contentType: mime,
      upsert: false,
    });
  if (up.error) return errState({ form: up.error.message });

  const { error } = await admin.from("documents").insert({
    id,
    trip_id: tripId,
    kind: parsed.data.kind,
    title: parsed.data.title,
    storage_path: storagePath,
    size_bytes: file.size,
    mime,
    content_hash: hash,
    source: "manual",
    uploaded_by_username: username,
  });

  if (error) {
    // roll back the storage object so we don't leave orphans
    await admin.storage.from(DOCS_BUCKET).remove([storagePath]);
    return errState({ form: error.message });
  }

  revalidatePath(`/trips/${slug}/docs`);
  revalidatePath(`/trips/${slug}`);
  redirect(`/trips/${slug}/docs`);
}

export async function updateDocumentAction(
  slug: string,
  docId: string,
  _prev: DocActionState,
  fd: FormData
): Promise<DocActionState> {
  const username = await getCurrentUsername();
  if (!username) return errState({ form: "Требуется вход" });

  const tripId = await resolveTripId(slug);
  if (!tripId) return errState({ form: "Поездка не найдена" });

  const parsed = metaSchema.safeParse({
    title: String(fd.get("title") ?? "").trim(),
    kind: String(fd.get("kind") ?? "other"),
  });
  if (!parsed.success) {
    const fields: DocFormErrors["fields"] = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0] as "title" | "kind";
      if (k && !fields[k]) fields[k] = i.message;
    }
    return errState({ fields });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("documents")
    .update({
      title: parsed.data.title,
      kind: parsed.data.kind,
    })
    .eq("id", docId)
    .eq("trip_id", tripId);
  if (error) return errState({ form: error.message });

  revalidatePath(`/trips/${slug}/docs`);
  revalidatePath(`/trips/${slug}/docs/${docId}`);
  redirect(`/trips/${slug}/docs/${docId}`);
}

export async function deleteDocumentAction(slug: string, docId: string) {
  const username = await getCurrentUsername();
  if (!username) return;

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("id,storage_path,trip_id")
    .eq("id", docId)
    .maybeSingle();

  const row = doc as
    | { id: string; storage_path: string; trip_id: string }
    | null;

  if (row) {
    await admin.from("documents").delete().eq("id", row.id);
    if (row.storage_path) {
      await admin.storage.from(DOCS_BUCKET).remove([row.storage_path]);
    }
  }

  revalidatePath(`/trips/${slug}/docs`);
  revalidatePath(`/trips/${slug}`);
}
