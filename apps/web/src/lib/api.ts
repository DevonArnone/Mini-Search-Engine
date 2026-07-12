import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[] | undefined>;
  };
}

export function apiError(code: string, message: string, status: number, details?: Record<string, string[] | undefined>) {
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

export function validationError(error: ZodError) {
  return apiError("invalid_request", "One or more request values are invalid.", 400, error.flatten().fieldErrors);
}

export class ServiceUnavailableError extends Error {
  constructor(public readonly service: "search" | "database") {
    super(`${service} service unavailable`);
    this.name = "ServiceUnavailableError";
  }
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, service: "search" | "database") {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ServiceUnavailableError(service)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
