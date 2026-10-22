import { createClientId } from '../../lib/id';
import { useAppStore } from '../../store/useAppStore';
import { connectSharedIssueSync, writeSharedIssues } from '../../services/sharedIssueSync';
import { createLocation } from '../../lib/coordinate';
import { issuesForModel, DEMO_MODEL_ID } from '../../lib/issues';
import { validateReport } from '../domain/report';
import type { ResidentGateway } from './contracts';
import type { ResidentIdentity, ReportDraft } from '../domain/report';

export function getResident(): ResidentIdentity {
  try {
    const saved = JSON.parse(localStorage.getItem('village-resident') || 'null');
    if (saved?.id && typeof saved.name === 'string') return saved;
  } catch {
    /* Create a local resident identity. */
  }
  const resident = { id: createClientId(), name: '热心村民' };
  try {
    localStorage.setItem('village-resident', JSON.stringify(resident));
  } catch {
    /* Reporting will show storage errors. */
  }
  return resident;
}
export function saveResident(resident: ResidentIdentity) {
  if (!resident.name.trim() || resident.name.length > 16) throw new Error('称呼请控制在 1–16 字。');
  localStorage.setItem(
    'village-resident',
    JSON.stringify({ ...resident, name: resident.name.trim() }),
  );
}
export const residentGateway: ResidentGateway = {
  async list(modelId = DEMO_MODEL_ID) {
    return issuesForModel(useAppStore.getState().village?.issues || [], modelId);
  },
  async report(draft, resident) {
    const error = validateReport(draft);
    if (error) throw new Error(error);
    const now = new Date().toISOString(),
      modelId = draft.modelId || DEMO_MODEL_ID;
    const issue = {
      id: `issue-${draft.submissionId || createClientId()}`,
      title: draft.title.trim(),
      description: draft.description.trim(),
      category: draft.category as Exclude<ReportDraft['category'], ''>,
      severity: draft.severity,
      area: draft.area.trim(),
      location: createLocation(draft.point!),
      ...(modelId === DEMO_MODEL_ID
        ? {
            sceneAnchor: {
              modelId: DEMO_MODEL_ID,
              position: [draft.point!.x, draft.point!.y, draft.point!.z] as [
                number,
                number,
                number,
              ],
            },
          }
        : { projectionAnchor: draft.projectionAnchor }),
      reporter: resident.name,
      residentId: resident.id,
      images: draft.images,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
      history: [
        { time: now, status: 'pending' as const, operator: resident.name, note: '问题已上报' },
      ],
    };
    const rows = await writeSharedIssues([issue], true);
    return rows.find((row) => row.id === issue.id) || issue;
  },
  watch(listener) {
    const stopStore = useAppStore.subscribe(listener),
      stopStorage = connectSharedIssueSync();
    return () => {
      stopStore();
      stopStorage();
    };
  },
};
const dbOpen = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('village-resident-drafts', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('draft');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
let draftQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const task = draftQueue.catch(() => {}).then(operation);
  draftQueue = task;
  return task;
}
async function draftOperation(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
) {
  const db = await dbOpen();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('draft', mode),
        req = run(tx.objectStore('draft'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export const draftStorage = {
  async read(modelId = DEMO_MODEL_ID): Promise<ReportDraft | null> {
    await draftQueue.catch(() => {});
    let value = (await draftOperation('readonly', (s) => s.get(`current:${modelId}`))) as
      ReportDraft | undefined;
    if (!value && modelId === DEMO_MODEL_ID)
      value = (await draftOperation('readonly', (s) => s.get('current'))) as
        ReportDraft | undefined;
    if (value && (value.modelId || DEMO_MODEL_ID) !== modelId) return null;
    return value && typeof value.title === 'string' && Array.isArray(value.images) ? value : null;
  },
  async write(draft: ReportDraft) {
    await enqueue(() =>
      draftOperation('readwrite', (s) => s.put(draft, `current:${draft.modelId || DEMO_MODEL_ID}`)),
    );
  },
  async clear(modelId = DEMO_MODEL_ID) {
    await enqueue(() => draftOperation('readwrite', (s) => s.delete(`current:${modelId}`)));
    if (modelId === DEMO_MODEL_ID)
      await enqueue(() => draftOperation('readwrite', (s) => s.delete('current')));
  },
};
