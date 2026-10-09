import { NextResponse } from "next/server";

export function ok(body: unknown = { ok: true }, status = 200) {
  return NextResponse.json(body, { status });
}

export function fail(err: unknown, status = 400) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status });
}

/** Wrap a handler so thrown errors become a JSON error response. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    return fail(err);
  }
}
