/** Non-authentication record IDs also work on phone LAN HTTP previews. */
export function createClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues)
    return [...globalThis.crypto.getRandomValues(new Uint32Array(4))]
      .map((value) => value.toString(16).padStart(8, '0'))
      .join('');
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
