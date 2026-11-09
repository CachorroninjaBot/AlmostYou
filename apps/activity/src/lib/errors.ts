export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message.trim() : '';
    const code =
      typeof record.code === 'string' || typeof record.code === 'number'
        ? String(record.code)
        : '';

    if (message && code) return `${message} (${code})`;
    if (message) return message;
    if (code) return code;

    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}') return json;
    } catch {
      // Circular structures fall through to the generic label.
    }
  }

  return String(error);
}
