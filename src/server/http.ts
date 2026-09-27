import "server-only";

/**
 * Reads the request body, or returns `null` once it exceeds `maxBytes`.
 * Content-Length alone isn't enough: chunked requests don't declare one.
 */
export async function readBody(
  request: Request,
  maxBytes: number,
): Promise<Buffer | null> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) {
    return null;
  }
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export type JsonBody =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 };

export async function readJson(
  request: Request,
  maxBytes: number,
): Promise<JsonBody> {
  const bytes = await readBody(request, maxBytes).catch(() => undefined);
  if (bytes === null) return { ok: false, status: 413 };
  if (!bytes) return { ok: false, status: 400 };
  try {
    return { ok: true, value: JSON.parse(bytes.toString("utf8")) };
  } catch {
    return { ok: false, status: 400 };
  }
}
