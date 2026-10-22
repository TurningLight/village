import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createApiServer } from '../server/api.mjs';
import { createIssueService } from '../server/issues.mjs';

function load(url, cache = new Map()) {
  if (cache.has(url.href)) return cache.get(url.href).exports;
  const module = { exports: {} };
  cache.set(url.href, module);
  const code = ts.transpileModule(fs.readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => load(new URL(`${name}.ts`, url), cache),
    ArrayBuffer,
    DataView,
    Float32Array,
    Number,
    Date,
    Intl,
    Math,
    globalThis: {
      crypto: {
        getRandomValues: (array) => {
          array.fill(5);
          return array;
        },
      },
    },
  });
  return module.exports;
}
const domain = load(new URL('../src/mobile/domain/report.ts', import.meta.url));
const audio = load(new URL('../src/mobile/domain/audio.ts', import.meta.url));
const validDraft = {
  ...domain.EMPTY_REPORT,
  title: '桥头路灯不亮',
  description: '桥头路灯连续两晚不亮，影响夜间通行。',
  category: '设施故障',
  area: '东侧桥头',
  point: { x: 70, y: 0, z: 5 },
};
const makeIssue = (id = 'issue-test', updated = '2026-10-22T01:00:00Z') => ({
  id,
  title: '桥头路灯不亮',
  description: '桥头路灯连续两晚不亮。',
  category: '设施故障',
  severity: 'medium',
  status: 'pending',
  area: '东侧桥头',
  reporter: '测试村民',
  residentId: 'resident-test',
  createdAt: updated,
  updatedAt: updated,
  location: { local: { x: 70, y: 0, z: 5 }, geo: { lng: 120.5, lat: 30.5 } },
  sceneAnchor: { modelId: 'qinghe-demo', position: [70, 0, 5] },
  images: ['data:image/jpeg;base64,/9j/'],
  history: [{ time: updated, status: 'pending', operator: '测试村民', note: '问题已上报' }],
});
async function api(t, { env = {}, fetchImpl } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'village-mobile-'));
  const file = join(dir, 'issues.json'),
    server = createApiServer({ env, file, fetchImpl });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  return { url: `http://127.0.0.1:${server.address().port}`, file };
}
const post = (url, path, body, headers = {}) =>
  fetch(url + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('report validation requires a real selected demo point and valid fields; voice merge preserves manual content and never invents coordinates', () => {
  assert.equal(domain.validateReport(validDraft), null);
  assert.match(domain.validateReport({ ...validDraft, point: null }), /标出位置/);
  assert.match(domain.validateReport({ ...validDraft, point: { x: 999, y: 0, z: 0 } }), /范围/);
  assert.match(domain.validateReport({ ...validDraft, description: '短' }), /5–1200/);
  const merged = domain.mergeVoiceFields(validDraft, {
    title: '新标题',
    description: '补充语音',
    category: '其他',
    area: '新位置',
    severity: 'high',
  });
  assert.equal(merged.title, validDraft.title);
  assert.equal(merged.area, validDraft.area);
  assert.equal(merged.category, validDraft.category);
  assert.equal(merged.point, validDraft.point);
  assert.match(merged.description, /影响夜间通行。\n补充语音/);
  assert.equal(merged.severity, 'medium');
});

test('recording WAV encoder emits mono 16kHz PCM, clamps samples, and supports LAN-safe record IDs', () => {
  const bytes = audio.encodeWav(new Float32Array([-2, -1, 0, 1, 2, NaN]));
  const view = new DataView(bytes);
  assert.equal(Buffer.from(bytes).toString('ascii', 0, 4), 'RIFF');
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(50, true), 32767);
  assert.equal(view.getInt16(54, true), 0);
  const ids = load(new URL('../src/lib/id.ts', import.meta.url));
  assert.equal(ids.createClientId().length, 32);
});

test('shared API persists reports, photos and owners across independent clients and server repository reopen', async (t) => {
  const { url, file } = await api(t);
  const issue = makeIssue();
  let response = await post(url, '/api/issues/report', { issues: [issue] });
  assert.equal(response.status, 200);
  const fromOtherClient = await (await fetch(url + '/api/issues')).json();
  assert.equal(fromOtherClient.issues[0].residentId, 'resident-test');
  assert.deepEqual(fromOtherClient.issues[0].images, issue.images);
  const repository = createIssueService(file);
  assert.equal((await repository.read())[0].sceneAnchor.position[0], 70);
  const done = {
    ...issue,
    status: 'completed',
    updatedAt: '2026-10-22T01:10:00Z',
    history: [
      ...issue.history,
      { time: '2026-10-22T01:10:00Z', status: 'completed', operator: '管理员', note: '灯具已修复' },
    ],
  };
  await post(url, '/api/issues', { issues: [done] });
  await post(url, '/api/issues', { issues: [issue] });
  const result = await (await fetch(url + '/api/issues')).json();
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].status, 'completed');
  assert.equal(result.issues[0].history.length, 2);
  assert.equal(JSON.parse(await readFile(file, 'utf8'))[0].status, 'completed');
  await post(url, '/api/issues/report', {
    issues: [{ ...issue, updatedAt: '2026-10-22T02:00:00Z' }],
  });
  assert.equal(
    (await (await fetch(url + '/api/issues')).json()).issues[0].status,
    'completed',
    'a report retry must not revert administrator work even with a newer retry timestamp',
  );
});

test('shared API rejects malformed records and foreign browser origins without losing committed data', async (t) => {
  const { url } = await api(t);
  await post(url, '/api/issues', { issues: [makeIssue()] });
  assert.equal(
    (await post(url, '/api/issues', { issues: [{ ...makeIssue('bad'), location: null }] })).status,
    400,
  );
  assert.equal(
    (
      await post(
        url,
        '/api/issues',
        { issues: [makeIssue('foreign')] },
        { Origin: 'https://unrelated.example' },
      )
    ).status,
    403,
  );
  assert.equal((await (await fetch(url + '/api/issues')).json()).issues.length, 1);
});

test('voice config and unavailable state expose no secret and never fabricate a transcript', async (t) => {
  let calls = 0;
  const { url } = await api(t, {
    fetchImpl: async () => {
      calls++;
      throw new Error('should not call');
    },
  });
  const config = await (await fetch(url + '/api/voice/config')).json();
  assert.equal(config.enabled, false);
  const response = await post(url, '/api/voice/transcribe', {
    audioBase64: 'AAAA',
    mimeType: 'audio/wav',
  });
  assert.equal(response.status, 503);
  const value = await response.json();
  assert.equal(value.error.code, 'NOT_CONFIGURED');
  assert.equal(value.text, undefined);
  assert.equal(calls, 0);
});

test('voice endpoints use distinct domestic ASR and formatting models, validate structured fields and keep the API key on the server', async (t) => {
  const calls = [];
  const { url } = await api(t, {
    env: { DASHSCOPE_API_KEY: 'sk-secret-for-test' },
    fetchImpl: async (endpoint, options) => {
      const payload = JSON.parse(options.body);
      calls.push({ endpoint, payload, authorization: options.headers.Authorization });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  payload.model === 'qwen3-asr-flash'
                    ? '东侧桥头路灯两晚没亮，晚上走路看不清。'
                    : JSON.stringify({
                        title: '东侧桥头路灯不亮',
                        description: '东侧桥头的路灯连续两晚未亮，影响夜间通行。',
                        category: '设施故障',
                        area: '东侧桥头',
                        severity: 'medium',
                      }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    },
  });
  const bytes = audio.encodeWav(new Float32Array(16000)),
    response = await post(url, '/api/voice/transcribe', {
      audioBase64: Buffer.from(bytes).toString('base64'),
      mimeType: 'audio/wav',
    });
  assert.equal(response.status, 200);
  const text = (await response.json()).text;
  const formatted = await post(url, '/api/voice/format', { text }),
    body = await formatted.json();
  assert.equal(body.fields.category, '设施故障');
  assert.equal(calls[0].payload.model, 'qwen3-asr-flash');
  assert.equal(calls[1].payload.model, 'qwen-plus');
  assert.equal(calls[1].payload.response_format.type, 'json_object');
  assert(
    calls[0].payload.messages[0].content[0].input_audio.data.startsWith('data:audio/wav;base64,'),
  );
  assert.equal(calls[0].authorization, 'Bearer sk-secret-for-test');
  assert(!JSON.stringify(body).includes('sk-secret'));
  assert(!(await (await fetch(url + '/api/voice/config')).text()).includes('sk-secret'));
});

test('voice rejects bad audio and safely reports provider authentication and invalid formatting responses', async (t) => {
  const { url } = await api(t, {
    env: { DASHSCOPE_API_KEY: 'sk-test' },
    fetchImpl: async () => new Response('upstream secret details', { status: 401 }),
  });
  assert.equal(
    (
      await post(url, '/api/voice/transcribe', {
        audioBase64: 'not-base64',
        mimeType: 'audio/webm',
      })
    ).status,
    400,
  );
  const response = await post(url, '/api/voice/format', { text: '村口有垃圾' });
  assert.equal(response.status, 503);
  const value = await response.text();
  assert(!value.includes('upstream secret'));
  assert.match(value, /PROVIDER_AUTH/);
});
