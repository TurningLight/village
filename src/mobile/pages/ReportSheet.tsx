import { createClientId } from '../../lib/id';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  MapPin,
  ChevronRight,
  Camera,
  ImagePlus,
  Check,
  LoaderCircle,
  ArrowRight,
} from 'lucide-react';
import { ISSUE_CATEGORIES } from '../../lib/issues';
import type { Vector3D, IssueCategory, Issue } from '../../types';
import type { SharedVillageMap } from '../../lib/sharedMapTypes';
import { EMPTY_REPORT, mergeVoiceFields, validateReport } from '../domain/report';
import type { ReportDraft, ResidentIdentity } from '../domain/report';
import { residentGateway, draftStorage } from '../adapters/localResident';
import { compressPhoto } from '../adapters/browserMedia';
import VoiceInput from '../components/VoiceInput';
import MobileMap from '../components/MobileMap';
import { categoryIcons } from '../components/categoryIcons';
function MapPicker({
  initial,
  initialAnchor,
  villageMap,
  onConfirm,
  onClose,
}: {
  initial: Vector3D | null;
  initialAnchor?: Issue['projectionAnchor'];
  villageMap: SharedVillageMap;
  onConfirm: (point: Vector3D, anchor?: Issue['projectionAnchor']) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [point, setPoint] = useState(initial),
    [anchor, setAnchor] = useState(initialAnchor);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="m-map-dialog"
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="m-dialog-heading">
        <h2>标一下问题在哪</h2>
        <button type="button" className="m-icon-button" aria-label="关闭地图选点" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      <p className="m-dialog-copy">{villageMap.name} · 点击底图标记问题位置，可以缩放后再选。</p>
      <MobileMap
        map={villageMap}
        point={point}
        anchor={anchor}
        onPick={(value, nextAnchor) => {
          setPoint(value);
          setAnchor(nextAnchor);
        }}
      />
      <p className="m-form-help">
        {villageMap.kind === 'real'
          ? '在实景模型投影上选点，不使用手机GPS定位。'
          : '当前为示意地图，位置不代表真实定位。'}
      </p>
      <button
        type="button"
        className="m-button full"
        disabled={
          !point ||
          (villageMap.kind === 'real' &&
            (!anchor || anchor.projectionCreatedAt !== villageMap.projection?.createdAt))
        }
        onClick={() => point && onConfirm(point, anchor)}
      >
        <Check size={18} />
        使用这个位置
      </button>
    </dialog>
  );
}
const hasContent = (draft: ReportDraft) =>
  !!(
    draft.title ||
    draft.description ||
    draft.area ||
    draft.category ||
    draft.point ||
    draft.images.length
  );
export default function ReportSheet({
  resident,
  villageMap,
  switchNotice,
}: {
  resident: ResidentIdentity;
  villageMap: SharedVillageMap;
  switchNotice?: string;
}) {
  const navigate = useNavigate(),
    dialog = useRef<HTMLDialogElement>(null),
    camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null),
    errorNode = useRef<HTMLParagraphElement>(null);
  const initial = { ...EMPTY_REPORT, modelId: villageMap.modelId, modelName: villageMap.name };
  const [draft, setDraft] = useState<ReportDraft>(initial),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [map, setMap] = useState(false),
    [photosBusy, setPhotosBusy] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [voiceBusy, setVoiceBusy] = useState(false),
    [voiceFilled, setVoiceFilled] = useState(false);
  const latest = useRef<ReportDraft>(initial),
    submitted = useRef(false),
    alive = useRef(true),
    loaded = useRef(false);
  useEffect(() => {
    alive.current = true;
    const node = dialog.current;
    node?.showModal();
    void draftStorage
      .read(villageMap.modelId)
      .then((value) => {
        if (alive.current && value) {
          latest.current = { ...value, modelId: villageMap.modelId, modelName: villageMap.name };
          setDraft(latest.current);
          setStatus('已恢复上次草稿');
        }
      })
      .catch(() => {
        if (alive.current) setStatus('草稿暂时无法读取');
      })
      .finally(() => {
        loaded.current = true;
        if (alive.current) setReady(true);
      });
    return () => {
      alive.current = false;
      node?.close();
      if (loaded.current && !submitted.current)
        void (
          hasContent(latest.current)
            ? draftStorage.write(latest.current)
            : draftStorage.clear(villageMap.modelId)
        ).catch(() => {});
    };
  }, [villageMap.modelId, villageMap.name]);
  useEffect(() => {
    if (!ready || submitted.current) return;
    const timer = setTimeout(() => {
      const task = hasContent(draft)
        ? draftStorage.write(draft)
        : draftStorage.clear(villageMap.modelId);
      void task
        .then(() => {
          if (alive.current) setStatus(hasContent(draft) ? '草稿已保存' : '');
        })
        .catch(() => {
          if (alive.current) setStatus('草稿未保存，请勿关闭页面');
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [draft, ready, villageMap.modelId]);
  useEffect(() => {
    if (!ready || villageMap.kind !== 'real' || !latest.current.projectionAnchor) return;
    if (latest.current.projectionAnchor.projectionCreatedAt !== villageMap.projection?.createdAt) {
      const next = { ...latest.current, point: null, projectionAnchor: undefined };
      latest.current = next;
      setDraft(next);
      setError('村庄底图已更新，填写内容已保留，请重新标记位置。');
    }
  }, [ready, villageMap.kind, villageMap.projection?.createdAt]);
  useEffect(() => {
    if (error) errorNode.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [error]);
  const change = (update: Partial<ReportDraft>) => {
    const next = { ...latest.current, ...update };
    latest.current = next;
    setDraft(next);
    setError('');
    if (ready) setStatus('正在保存草稿…');
  };
  const close = () => {
    if (submitting) return;
    navigate('/mobile', { replace: true });
  };
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    if (files.length + draft.images.length > 4) {
      setError('最多添加 4 张现场照片。');
      return;
    }
    setPhotosBusy(true);
    try {
      const images = await Promise.all(Array.from(files).map(compressPhoto));
      if (alive.current) change({ images: [...latest.current.images, ...images].slice(0, 4) });
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : '照片读取失败。');
    } finally {
      if (alive.current) setPhotosBusy(false);
      if (camera.current) camera.current.value = '';
      if (gallery.current) gallery.current.value = '';
    }
  };
  const submit = async () => {
    if (submitting || voiceBusy || photosBusy) return;
    if (
      villageMap.kind === 'real' &&
      (!villageMap.projection ||
        draft.projectionAnchor?.projectionCreatedAt !== villageMap.projection.createdAt)
    ) {
      setError('请先在当前村庄的实景二维底图上选点；底图未就绪时请联系管理端生成并共享。');
      return;
    }
    const message = validateReport(draft);
    if (message) {
      setError(message);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (!latest.current.submissionId) change({ submissionId: createClientId() });
      const issue = await residentGateway.report(latest.current, resident);
      submitted.current = true;
      await draftStorage.clear(villageMap.modelId).catch(() => {});
      if (alive.current) navigate(`/mobile/success/${issue.id}`, { replace: true });
    } catch (error) {
      if (alive.current) {
        setError(error instanceof Error ? error.message : '上报暂未成功，请重试。');
        setSubmitting(false);
      }
    }
  };
  return (
    <dialog
      ref={dialog}
      className="m-report-dialog"
      aria-labelledby="report-heading"
      onCancel={(e) => {
        e.preventDefault();
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="m-report-header">
        <button
          type="button"
          className="m-icon-button"
          aria-label="关闭上报，保留草稿"
          onClick={close}
          disabled={submitting}
        >
          <X size={23} />
        </button>
        <h1 id="report-heading">随手报一件事</h1>
        <span role="status">{status}</span>
      </div>
      {!ready ? (
        <div className="m-loading">
          <LoaderCircle className="m-spin" />
          正在准备上报表单…
        </div>
      ) : (
        <form
          noValidate
          className="m-report-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="m-report-body">
            <p className="m-form-lead">
              上报至{villageMap.name}。把问题说清楚，村里就能更好地跟进。
            </p>
            {switchNotice && (
              <p className="m-helper" role="status">
                {switchNotice}
              </p>
            )}
            <VoiceInput
              onBusy={setVoiceBusy}
              onFields={(fields) => {
                const next = mergeVoiceFields(latest.current, fields);
                change(next);
                setVoiceFilled(true);
              }}
            />
            {voiceFilled && (
              <p className="m-voice-filled" role="status">
                <Check size={16} />
                语音已整理填入，请核对后提交。
              </p>
            )}
            <fieldset disabled={voiceBusy || submitting} className="m-fields">
              <legend className="m-sr-only">事件信息</legend>
              <div className="m-field">
                <label htmlFor="report-title">
                  问题标题<em>必填</em>
                </label>
                <input
                  id="report-title"
                  value={draft.title}
                  maxLength={60}
                  placeholder="例如：村口路灯不亮了"
                  onChange={(e) => change({ title: e.target.value })}
                />
              </div>
              <div className="m-field">
                <span className="m-field-label" id="category-label">
                  是哪类问题<em>必填</em>
                </span>
                <div
                  className="m-category-options"
                  role="radiogroup"
                  aria-labelledby="category-label"
                >
                  {ISSUE_CATEGORIES.map((category) => {
                    const Icon = categoryIcons[category];
                    return (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={draft.category === category}
                        key={category}
                        className={draft.category === category ? 'active' : ''}
                        onClick={() => change({ category: category as IssueCategory })}
                      >
                        <Icon size={19} />
                        {category}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="m-field">
                <label htmlFor="report-description">
                  具体是什么情况<em>必填</em>
                </label>
                <textarea
                  id="report-description"
                  rows={4}
                  maxLength={1200}
                  value={draft.description}
                  placeholder="说说发现了什么、影响了什么。越具体，越方便村里处理。"
                  onChange={(e) => change({ description: e.target.value })}
                />
                <span className="m-input-count">{draft.description.length}/1200</span>
              </div>
              <div className="m-field">
                <label htmlFor="report-area">
                  在哪里发生<em>必填</em>
                </label>
                <input
                  id="report-area"
                  value={draft.area}
                  maxLength={60}
                  placeholder="例如：东边桥头，王阿姨家附近"
                  onChange={(e) => change({ area: e.target.value })}
                />
                <button
                  type="button"
                  className={`m-location-select ${draft.point ? 'selected' : ''}`}
                  onClick={() => setMap(true)}
                >
                  <span>
                    <MapPin size={21} />
                    <span>
                      <strong>
                        {draft.point
                          ? '已在地图上标记'
                          : villageMap.kind === 'real'
                            ? '在实景底图上标一下'
                            : '在村庄地图上标一下'}
                      </strong>
                      <small>{draft.point ? '点击可重新选择位置' : '便于找到问题的具体位置'}</small>
                    </span>
                  </span>
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="m-field">
                <span className="m-field-label">
                  现场照片<em className="optional">选填 · 最多4张</em>
                </span>
                <p className="m-form-help">拍清楚问题就好，尽量避开人脸和车牌。</p>
                <div className="m-photo-grid">
                  {draft.images.map((src, i) => (
                    <div className="m-photo" key={`${i}-${src.slice(-20)}`}>
                      <img src={src} alt={`已选现场照片${i + 1}`} />
                      <button
                        type="button"
                        aria-label={`移除照片${i + 1}`}
                        onClick={() =>
                          change({ images: draft.images.filter((_, index) => i !== index) })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {draft.images.length < 4 && (
                    <>
                      <button
                        type="button"
                        className="m-add-photo"
                        onClick={() => camera.current?.click()}
                        disabled={photosBusy}
                      >
                        <Camera size={25} />
                        <span>拍一张</span>
                      </button>
                      <button
                        type="button"
                        className="m-add-photo"
                        onClick={() => gallery.current?.click()}
                        disabled={photosBusy}
                      >
                        <ImagePlus size={25} />
                        <span>从相册选</span>
                      </button>
                    </>
                  )}
                </div>
                {photosBusy && (
                  <p className="m-form-help" role="status">
                    正在处理照片…
                  </p>
                )}
                <input
                  ref={camera}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => void addPhotos(e.target.files)}
                />
                <input
                  ref={gallery}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => void addPhotos(e.target.files)}
                />
              </div>
              <div className="m-field">
                <label htmlFor="report-severity">对日常生活的影响</label>
                <select
                  id="report-severity"
                  value={draft.severity}
                  onChange={(e) => change({ severity: e.target.value as ReportDraft['severity'] })}
                >
                  <option value="low">一般，暂不影响通行或使用</option>
                  <option value="medium">需要关注，已经影响日常使用</option>
                  <option value="high">较紧急，存在安全隐患</option>
                </select>
              </div>
            </fieldset>
            {error && (
              <p ref={errorNode} className="m-form-error" role="alert">
                {error}
              </p>
            )}
            <p className="m-form-privacy">
              本次上报属于{villageMap.name}
              ，记录和照片会保存到本地服务，与管理端同步。请确认位置与描述准确后提交。
            </p>
          </div>
          <div className="m-report-footer">
            <button
              type="submit"
              className="m-button full"
              disabled={submitting || photosBusy || voiceBusy}
            >
              {submitting ? (
                <LoaderCircle className="m-spin" size={20} />
              ) : (
                <ArrowRight size={20} />
              )}{' '}
              {submitting ? '正在提交…' : '确认并提交上报'}
            </button>
          </div>
        </form>
      )}
      {map && (
        <MapPicker
          initial={draft.point}
          initialAnchor={draft.projectionAnchor}
          villageMap={villageMap}
          onClose={() => setMap(false)}
          onConfirm={(point, projectionAnchor) => {
            change({ point, projectionAnchor });
            setMap(false);
          }}
        />
      )}
    </dialog>
  );
}
