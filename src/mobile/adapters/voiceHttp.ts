import type { VoiceGateway } from './contracts';
async function request(path: string, body?: unknown, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(`/api/voice/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(70000)])
        : AbortSignal.timeout(70000),
    });
  } catch {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
    throw new Error('网络连接中断，请检查网络后重试。');
  }
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error('语音服务暂不可用，请稍后重试。');
  }
  if (!response.ok) throw new Error(value.error?.message || '语音服务暂不可用，请稍后重试。');
  return value;
}
export const voiceGateway: VoiceGateway = {
  config: () => request('config'),
  async transcribe(clip, signal) {
    const bytes = new Uint8Array(await clip.blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const value = await request(
      'transcribe',
      { audioBase64: btoa(binary), mimeType: 'audio/wav' },
      signal,
    );
    return value.text;
  },
  async format(text, signal) {
    const value = await request('format', { text }, signal);
    return value.fields;
  },
};
