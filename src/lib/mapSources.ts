import { BAGUA_MODEL_ID } from './issues';

export interface SketchfabSource {
  type: 'sketchfab';
  modelId: string;
  name: string;
}
export type MapSelection = { type: 'local' } | SketchfabSource;

export const BAGUA_SOURCE: SketchfabSource = { type: 'sketchfab', modelId: BAGUA_MODEL_ID, name: '黎槎八卦村' };

export function sketchfabModelUrl(modelId: string) {
  return `https://sketchfab.com/3d-models/${modelId}`;
}

export function parseSketchfabSource(input: string, name = ''): SketchfabSource {
  const value = input.trim();
  let modelId = /^[a-f0-9]{32}$/i.test(value) ? value.toLowerCase() : '';
  if (!modelId) {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol) || !['sketchfab.com', 'www.sketchfab.com'].includes(url.hostname)) throw new Error();
      const match = url.pathname.match(/^\/(?:3d-models\/[^/]*?|models\/)([a-f0-9]{32})(?:\/embed)?\/?$/i);
      if (match) modelId = match[1].toLowerCase();
    } catch { /* Show one actionable validation message below. */ }
  }
  if (!modelId) throw new Error('请输入 Sketchfab 模型页面链接、嵌入链接或 32 位模型 ID。');
  return { type: 'sketchfab', modelId, name: name.trim().slice(0, 80) || (modelId === BAGUA_MODEL_ID ? BAGUA_SOURCE.name : 'Sketchfab 在线模型') };
}
