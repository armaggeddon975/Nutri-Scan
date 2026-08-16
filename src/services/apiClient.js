export class ApiError extends Error {
  constructor(message, status = 0, code = "NETWORK_ERROR", details = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 10000);

  try {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      credentials: "include",
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal || controller.signal,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const error = data.error || {};
      throw new ApiError(
        error.message || "Não foi possível completar a operação.",
        response.status,
        error.code || "HTTP_ERROR",
        error.details,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === "AbortError") {
      throw new ApiError("A API demorou para responder.", 0, "TIMEOUT");
    }
    throw new ApiError("API indisponível no momento.", 0, "NETWORK_ERROR");
  } finally {
    window.clearTimeout(timeout);
  }
}
