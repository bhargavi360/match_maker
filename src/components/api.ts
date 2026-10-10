"use client";
export async function api<T = { ok: boolean }>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.issues?.map((issue: { field: string; message: string }) => issue.field + ": " + issue.message).join(" ") || data.error || "This operation could not complete.");
  return data as T;
}
