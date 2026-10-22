import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildGovernanceEvidence,
  buildGovernanceFacts,
  getCompletedAt,
  issueBelongsToModel,
  issueModelId,
  issueModelIds,
  monthInShanghai,
} from '../shared/governanceFacts.mjs';

const BAGUA = '2b79987cd49c4727b1bd12aa7ab62927';
const now = '2026-10-22T10:00:00.000Z';
function issue(overrides = {}) {
  return {
    id: 'issue-a',
    title: '巷道路灯不亮',
    description: '晚间经过时发现路灯不亮。',
    category: '设施故障',
    severity: 'medium',
    status: 'pending',
    area: '东门巷',
    createdAt: '2026-10-01T01:00:00.000Z',
    updatedAt: '2026-10-22T02:00:00.000Z',
    reporter: '居民姓名',
    residentId: 'resident-private',
    images: ['data:image/png;base64,private'],
    location: { local: { x: 12, y: 6, z: -9 }, geo: { lng: 122.12345, lat: 29.4321 } },
    sceneAnchor: { modelId: 'real-a', position: [12, 6, -9] },
    history: [
      {
        status: 'pending',
        time: '2026-10-01T01:00:00.000Z',
        operator: '内部姓名',
        note: '等待处理',
      },
    ],
    ...overrides,
  };
}
const facts = (rows, month = '2026-10', modelId = 'real-a') =>
  buildGovernanceFacts(rows, { modelId, month, now });

test('model filtering preserves projection precedence and explicit legacy compatibility without coordinate inference', () => {
  const a = issue();
  const b = issue({
    id: 'same-coordinates-other-village',
    sceneAnchor: { modelId: 'real-b', position: [12, 6, -9] },
  });
  const conflicting = issue({ id: 'projection-wins', projectionAnchor: { modelId: 'real-b' } });
  const legacy = issue({ id: 'legacy', sceneAnchor: undefined });
  assert.equal(issueModelId(conflicting), 'real-b');
  assert.equal(issueModelId(legacy), null);
  assert.deepEqual(issueModelIds(legacy), [BAGUA, 'qinghe-demo']);
  assert.equal(issueBelongsToModel(legacy, BAGUA), true);
  assert.equal(issueBelongsToModel(legacy, 'qinghe-demo'), true);
  assert.equal(issueBelongsToModel(legacy, 'real-a'), false);
  assert.equal(facts([a, b, conflicting, legacy]).counts.totalInVillage, 1);
  assert.deepEqual(
    facts([a, b, conflicting, legacy]).evidence.map((row) => row.id),
    ['issue-a'],
  );
});

test('Shanghai boundary assigns UTC September evening to October and fills daily zero values', () => {
  const before = issue({ id: 'before', createdAt: '2026-09-30T15:59:59.000Z', history: [] });
  const after = issue({ id: 'after', createdAt: '2026-09-30T16:00:00.000Z', history: [] });
  assert.equal(monthInShanghai(after.createdAt), '2026-10');
  assert.equal(monthInShanghai(before.createdAt), '2026-09');
  const result = facts([before, after]);
  assert.equal(result.counts.reportedInMonth, 1);
  assert.equal(result.trend.length, 31);
  assert.deepEqual(result.trend[0], { day: '2026-10-01', reported: 1, completed: 0 });
  assert.deepEqual(result.trend.at(-1), { day: '2026-10-31', reported: 0, completed: 0 });
  assert.equal(facts([], '2024-02').trend.length, 29);
});

test('completed notes do not reset closure; reopened cases use the new cycle and exclude currently open cases', () => {
  const closed = issue({
    status: 'completed',
    history: [
      { status: 'pending', time: '2026-10-01T01:00:00Z', note: '收到' },
      { status: 'completed', time: '2026-10-02T01:00:00Z', note: '更换灯具' },
      { status: 'completed', time: '2026-10-03T01:00:00Z', note: '补充材料' },
    ],
  });
  assert.equal(getCompletedAt(closed), '2026-10-02T01:00:00.000Z');
  const reopened = {
    ...closed,
    id: 'reopened',
    status: 'processing',
    history: [
      ...closed.history,
      { status: 'processing', time: '2026-10-04T01:00:00Z', note: '再次故障' },
    ],
  };
  assert.equal(getCompletedAt(reopened), null);
  const closedAgain = {
    ...reopened,
    id: 'closed-again',
    status: 'completed',
    history: [
      ...reopened.history,
      { status: 'completed', time: '2026-10-05T01:00:00Z', note: '复修完成' },
    ],
  };
  assert.equal(getCompletedAt(closedAgain), '2026-10-05T01:00:00.000Z');
  const result = facts([closed, reopened, closedAgain]);
  assert.equal(result.counts.completedInMonth, 2);
  assert.equal(result.counts.processingNow, 1);
  assert.equal(result.counts.completionSampleCount, 2);
  assert.equal(result.counts.averageCompletionHours, 60);
  assert.equal(result.trend[1].completed, 1);
  assert.equal(result.trend[4].completed, 1);
});

test('cross-month closure is based on processing history rather than latest edit timestamp', () => {
  const old = issue({
    id: 'last-month-close',
    createdAt: '2026-09-01T01:00:00Z',
    status: 'completed',
    history: [{ status: 'completed', time: '2026-09-03T01:00:00Z', note: '完成' }],
  });
  const incoming = issue({
    id: 'this-month-close',
    createdAt: '2026-09-30T15:00:00Z',
    status: 'completed',
    history: [{ status: 'completed', time: '2026-09-30T17:00:00Z', note: '完成' }],
  });
  const result = facts([old, incoming]);
  assert.equal(result.counts.reportedInMonth, 0);
  assert.equal(result.counts.completedInMonth, 1);
  assert.equal(result.counts.averageCompletionHours, 2);
  assert.equal(result.trend[0].completed, 1);
  assert.deepEqual(
    result.evidence.map((row) => row.id),
    ['this-month-close'],
  );
});

test('missing, invalid, contradictory and pre-report histories never fabricate completion dates', () => {
  const variants = [
    [],
    [{ status: 'completed', time: 'bad' }],
    [{ status: 'completed', time: '2026-09-30T01:00:00Z' }],
    [
      { status: 'completed', time: '2026-10-02T01:00:00Z' },
      { status: 'processing', time: '2026-10-03T01:00:00Z' },
    ],
  ];
  const rows = variants.map((history, index) =>
    issue({ id: `bad-${index}`, status: 'completed', history }),
  );
  for (const row of rows) assert.equal(getCompletedAt(row), null);
  const result = facts(rows);
  assert.equal(result.counts.completedInMonth, 0);
  assert.equal(result.counts.averageCompletionHours, null);
  assert.equal(result.counts.completionSampleCount, 0);
  assert(result.limitations.some((text) => text.includes('4 条当前已办结事项缺少可信办结时间')));
});

test('hotspots group registered area names with traceable IDs and never cluster identical model coordinates', () => {
  const result = facts([
    issue({ id: 'a' }),
    issue({ id: 'b', area: '  东门巷  ', status: 'processing' }),
    issue({ id: 'c', area: '西门巷', category: '积水问题' }),
    issue({ id: 'd', area: '  ' }),
    issue({ id: 'old-open', area: '东门巷', createdAt: '2026-09-10T01:00:00Z', history: [] }),
  ]);
  assert.deepEqual(
    result.hotspots.find((place) => place.area === '东门巷'),
    { area: '东门巷', count: 2, open: 2, issueIds: ['a', 'b'] },
  );
  assert.equal(result.hotspots.length, 3);
  assert(result.hotspots.some((place) => place.area === '未注明地点'));
  assert.equal(result.counts.reportedInMonth, 4);
  assert.equal(result.counts.openNow, 5);
  assert.deepEqual(result.categories, [
    { name: '设施故障', count: 3 },
    { name: '积水问题', count: 1 },
  ]);
  assert(result.limitations.some((text) => text.includes('不代表真实事故率')));
  assert(result.limitations.some((text) => text.includes('未使用 GPS')));
});

test('generic area labels retain traceable groups but never imply one physical hotspot', () => {
  const rows = ['村内选点', ' 村内选点 ', '未注明地点', '未知地点', '村内', ''].map((area, index) =>
    issue({ id: `generic-${index}`, area }),
  );
  const result = facts(rows);
  assert.equal(result.counts.reportedInMonth, 6);
  assert.deepEqual(
    result.hotspots.find((place) => place.area === '村内选点'),
    {
      area: '村内选点',
      count: 2,
      open: 2,
      issueIds: ['generic-0', 'generic-1'],
    },
  );
  assert.equal(result.hotspots.find((place) => place.area === '未注明地点').count, 2);
  assert(
    result.limitations.some(
      (text) =>
        text.includes('泛称或缺失位置') &&
        text.includes('不能视为发生在同一物理地点') &&
        text.includes('应先补充并核实具体定位'),
    ),
  );
  assert(
    !facts([issue({ area: '村内东门巷' })]).limitations.some((text) =>
      text.includes('泛称或缺失位置'),
    ),
  );
});

test('evidence is a bounded whitelist without identities, photos or raw coordinates and discloses truncation', () => {
  const source = issue({
    description: `居民姓名 联系13800138000 user@example.com ${'x'.repeat(900)}`,
    history: Array.from({ length: 30 }, (_, index) => ({
      time: new Date(Date.parse('2026-10-01T01:00:00Z') + index * 60_000).toISOString(),
      status: 'processing',
      operator: 'private-operator',
      note: `note-${index} ${'x'.repeat(300)}`,
    })),
  });
  const evidence = buildGovernanceEvidence(source);
  assert.equal(evidence.description.length, 600);
  assert.equal(evidence.history.length, 12);
  assert(evidence.history[0].note.startsWith('note-0 '));
  assert(evidence.history[2].note.startsWith('note-20 '));
  assert(evidence.history.every((entry) => entry.note.length <= 240));
  const raw = JSON.stringify(evidence);
  for (const text of [
    '13800138000',
    'user@example.com',
    'resident-private',
    'private-operator',
    '居民姓名',
    '122.12345',
    'sceneAnchor',
    'projectionAnchor',
    'images',
    'reporter',
    'residentId',
    'operator',
    'location',
  ])
    assert(!raw.includes(text), text);
  assert(raw.includes('[已隐藏手机号]'));
  const rows = Array.from({ length: 60 }, (_, index) =>
    issue({ id: `many-${index}`, severity: index === 59 ? 'high' : 'low' }),
  );
  const result = facts([source, ...rows]);
  assert.equal(result.counts.totalInVillage, 61);
  assert.equal(result.evidenceTotal, 61);
  assert.equal(result.evidence.length, 50);
  assert.equal(result.evidence[0].id, 'many-59');
  assert(result.limitations.some((text) => text.includes('前 50 条')));
  assert(result.limitations.some((text) => text.includes('长度截断')));
  assert.equal(source.description.length > 600, true, 'source data is not mutated');
});

test('empty, demo and future-dated datasets state their evidence limitations', () => {
  const empty = facts([]);
  assert.equal(empty.counts.totalInVillage, 0);
  assert.equal(empty.evidenceTotal, 0);
  assert.equal(empty.counts.averageCompletionHours, null);
  assert(empty.limitations.some((text) => text.includes('样本较少')));
  const demo = facts([issue({ sceneAnchor: undefined })], '2026-10', 'qinghe-demo');
  assert(demo.limitations.some((text) => text.includes('用于演示')));
  const future = facts([
    issue({
      createdAt: '2026-10-30T01:00:00Z',
      status: 'completed',
      history: [{ status: 'completed', time: '2026-10-31T01:00:00Z' }],
    }),
  ]);
  assert.equal(future.counts.reportedInMonth, 0);
  assert.equal(future.counts.completedInMonth, 0);
  assert(future.limitations.some((text) => text.includes('晚于统计时点')));
  const futureClose = facts([
    issue({
      status: 'completed',
      history: [{ status: 'completed', time: '2026-10-31T01:00:00Z' }],
    }),
  ]);
  assert.equal(futureClose.evidence[0].completedAt, null);
  assert.equal(futureClose.counts.completedInMonth, 0);
  assert.throws(() => facts([], '2026-13'), /YYYY-MM/);
});
