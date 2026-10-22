import { useEffect, useRef, useState } from 'react';
import { Check, FolderOpen, LoaderCircle, Upload, X } from 'lucide-react';
import type { StoredModel } from '../../lib/modelStorage';
import { BAGUA_SOURCE, sketchfabModelUrl } from '../../lib/mapSources';
import type { MapSelection, SketchfabSource } from '../../lib/mapSources';

interface Props {
  storedModel: StoredModel | null;
  selection: MapSelection;
  online: SketchfabSource;
  busy: boolean;
  status: string;
  error: string;
  onFiles: (files: File[]) => void;
  onOnline: (input: string, name: string) => void;
  onUseSaved: () => void;
  onSourceChange: () => void;
  onClose: () => void;
}

export default function ModelUpload({ storedModel, selection, online, busy, status, error, onFiles, onOnline, onUseSaved, onSourceChange, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState(selection.type);
  const [url, setUrl] = useState(sketchfabModelUrl(online.modelId));
  const [name, setName] = useState(online.name);
  useEffect(() => {
    folderRef.current?.setAttribute('webkitdirectory', '');
    headingRef.current?.focus();
  }, []);
  useEffect(() => {
    if (status || error) feedbackRef.current?.scrollIntoView({ block: 'nearest' });
  }, [status, error]);
  const choose = (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) onFiles(files);
  };
  return (
    <section className="model-upload-panel" role="dialog" aria-labelledby="model-upload-title" aria-modal="false" aria-busy={busy} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <header className="issue-panel-header">
        <h2 id="model-upload-title" tabIndex={-1} ref={headingRef}>地图设置</h2>
        <button type="button" className="issue-panel-close" aria-label="关闭地图设置" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="model-upload-body">
        <p className="model-upload-intro">管理员可选择地图来源，保存为下次打开时的默认地图。</p>
        <dl className="model-current">
          <dt>当前地图</dt>
          <dd>{selection.type === 'local' ? storedModel?.name : selection.name}</dd>
          <dt>当前来源</dt><dd>{selection.type === 'local' ? '本地上传' : 'Sketchfab 在线嵌入'}</dd>
        </dl>
        <fieldset className="model-source-options" disabled={busy}>
          <legend>选择地图来源</legend>
          <label className={source === 'local' ? 'is-selected' : ''}><input type="radio" name="map-source" value="local" checked={source === 'local'} onChange={() => { setSource('local'); onSourceChange(); }} /><span>本地上传</span></label>
          <label className={source === 'sketchfab' ? 'is-selected' : ''}><input type="radio" name="map-source" value="sketchfab" checked={source === 'sketchfab'} onChange={() => { setSource('sketchfab'); onSourceChange(); }} /><span>Sketchfab 在线</span></label>
        </fieldset>
        {source === 'local' ? <>
        {storedModel && <div className="model-saved-local"><p>已保存：<strong>{storedModel.name}</strong> · {(storedModel.size / 1024 / 1024).toFixed(1)} MB</p><button type="button" className="issue-secondary" disabled={busy || selection.type === 'local'} onClick={onUseSaved}>{selection.type === 'local' ? '正在使用此本地模型' : '使用已保存的本地模型'}</button></div>}
        <div className="model-file-actions">
          <input ref={fileRef} type="file" accept=".glb,.gltf,.zip,.bin,.png,.jpg,.jpeg,.webp,.ktx2" multiple hidden aria-label="选择模型文件" onChange={(event) => choose(event.currentTarget)} />
          <input ref={folderRef} type="file" multiple hidden aria-label="选择模型文件夹" onChange={(event) => choose(event.currentTarget)} />
          <button type="button" className="issue-primary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} />选择模型文件 / ZIP</button>
          <button type="button" className="issue-secondary" disabled={busy} onClick={() => { folderRef.current?.setAttribute('webkitdirectory', ''); folderRef.current?.click(); }}><FolderOpen size={16} />选择文件夹</button>
        </div>
        <ul className="model-format-help">
          <li><strong>GLB</strong>：推荐，模型与纹理打包为一个文件。</li>
          <li><strong>glTF</strong>：上传 ZIP 或选择完整文件夹，包含 .gltf、.bin 和纹理，保留相对目录。</li>
          <li>每次载入一个模型，总大小 / ZIP 解压后不超过 512 MB。</li>
        </ul>
        <p className="issue-local-note">新模型校验并保存成功后替换原本地模型。模型文件仅保存在当前浏览器。</p>
        </> : <form className="model-online-form" onSubmit={(event) => { event.preventDefault(); onOnline(url, name); }}>
          <p className="model-online-hint" id="sketchfab-help">使用 Sketchfab 托管的公开模型，无需下载文件，需要联网。</p>
          <label htmlFor="sketchfab-url">模型链接或 ID</label>
          <input id="sketchfab-url" value={url} onChange={(event) => { setUrl(event.target.value); onSourceChange(); }} required disabled={busy} placeholder="https://sketchfab.com/3d-models/…" aria-describedby="sketchfab-help" autoComplete="off" spellCheck={false} />
          <label htmlFor="sketchfab-name">地图名称 <span>选填</span></label>
          <input id="sketchfab-name" value={name} onChange={(event) => { setName(event.target.value); onSourceChange(); }} maxLength={80} disabled={busy} placeholder="例如：黎槎八卦村" />
          <div className="model-file-actions"><button type="submit" className="issue-primary" disabled={busy}>{busy ? '正在连接…' : '应用在线模型'}</button><button type="button" className="issue-secondary" disabled={busy} onClick={() => { setUrl(sketchfabModelUrl(BAGUA_SOURCE.modelId)); setName(BAGUA_SOURCE.name); onOnline(BAGUA_SOURCE.modelId, BAGUA_SOURCE.name); }}>使用黎槎八卦村</button></div>
          <p className="issue-local-note">连接成功后保存为默认地图。切换在线地图会保留已上传的本地模型，之后可直接切回。其他模型的署名与许可请查看其原始页面。</p>
        </form>}
        <p className="issue-local-note">选择保存在当前浏览器和网址，刷新后自动恢复。事件按模型区分；切回原模型可继续查看其事件。</p>
        <div ref={feedbackRef}>{status && <p className="model-upload-status" role="status" aria-live="polite">{busy ? <LoaderCircle size={16} className="loading-spin" /> : <Check size={16} />}{status}</p>}
        {error && <p className="issue-error" role="alert">{error}</p>}</div>
      </div>
    </section>
  );
}
