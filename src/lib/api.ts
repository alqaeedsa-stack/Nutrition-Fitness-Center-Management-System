const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = response.statusText || `HTTP ${response.status}`;

    try {
      const body = await response.json();
      const apiError = body?.error;
      if (typeof apiError?.message === 'string' && apiError.message.trim()) {
        message = apiError.message.trim();
        if (typeof apiError.code === 'string' && apiError.code.trim()) {
          message = `${apiError.code}: ${message}`;
        }
      }
    } catch {
      // Keep the HTTP status message when the response is not valid JSON.
    }

    throw new Error(`API request failed (${response.status}): ${message}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
