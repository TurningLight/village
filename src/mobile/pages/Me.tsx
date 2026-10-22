import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  UserRound,
  ChevronRight,
  FilePenLine,
  ClipboardList,
  HeartHandshake,
  ShieldCheck,
  X,
  Check,
} from 'lucide-react';
import type { Issue } from '../../types';
import type { ResidentIdentity } from '../domain/report';
import { saveResident, draftStorage } from '../adapters/localResident';
import type { SharedVillageMap } from '../../lib/sharedMapTypes';
export default function Me({
  issues,
  resident,
  onResident,
  map,
}: {
  issues: Issue[];
  resident: ResidentIdentity;
  onResident: (value: ResidentIdentity) => void;
  map: SharedVillageMap;
}) {
  const [panel, setPanel] = useState<'profile' | 'help' | 'about' | null>(null),
    [name, setName] = useState(resident.name),
    [error, setError] = useState(''),
    [hasDraft, setHasDraft] = useState(false),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (panel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [panel]);
  useEffect(() => {
    void draftStorage
      .read(map.modelId)
      .then((draft) => setHasDraft(!!draft))
      .catch(() => {});
  }, [map.modelId]);
  const mine = issues.filter((i) => i.residentId === resident.id);
  return (
    <div className="m-page">
      <h1 className="m-me-title">我的乡居</h1>
      <button className="m-profile" onClick={() => setPanel('profile')}>
        <span className="m-avatar">
          <UserRound size={32} />
        </span>
        <div>
          <strong>{resident.name}</strong>
          <p>{map.name} · 本机村民身份</p>
        </div>
        <ChevronRight size={20} />
      </button>
      <div className="m-my-stats">
        <div>
          <strong>{mine.length}</strong>
          <span>我的上报</span>
        </div>
        <div>
          <strong>{mine.filter((i) => i.status !== 'completed').length}</strong>
          <span>正在跟进</span>
        </div>
        <div>
          <strong>{mine.filter((i) => i.status === 'completed').length}</strong>
          <span>已经办结</span>
        </div>
      </div>
      <div className="m-settings-list">
        <Link to="/mobile/progress?mine=1">
          <ClipboardList size={21} />
          <span>我的上报记录</span>
          <ChevronRight size={18} />
        </Link>
        <Link to="/mobile/report">
          <FilePenLine size={21} />
          <span>
            上报草稿<small>{hasDraft ? '有一份未提交的草稿' : '还没有未提交的草稿'}</small>
          </span>
          <ChevronRight size={18} />
        </Link>
        <button onClick={() => setPanel('help')}>
          <HeartHandshake size={21} />
          <span>使用帮助</span>
          <ChevronRight size={18} />
        </button>
        <button onClick={() => setPanel('about')}>
          <ShieldCheck size={21} />
          <span>关于与隐私说明</span>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="m-me-footer">
        <HeartHandshake size={27} strokeWidth={1.3} />
        <p>
          关心村里的小事，
          <br />
          就是建设家乡的大事。
        </p>
        <span>乡居共治 · 村民端</span>
      </div>
      <dialog
        ref={dialog}
        className="m-small-dialog"
        onCancel={(e) => {
          e.preventDefault();
          setPanel(null);
        }}
      >
        <div className="m-dialog-heading">
          <h2>
            {panel === 'profile'
              ? '怎么称呼你'
              : panel === 'help'
                ? '把问题交给村里'
                : '关于乡居共治'}
          </h2>
          <button className="m-icon-button" aria-label="关闭" onClick={() => setPanel(null)}>
            <X size={20} />
          </button>
        </div>
        {panel === 'profile' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                saveResident({ ...resident, name });
                onResident({ ...resident, name: name.trim() });
                setPanel(null);
                setError('');
              } catch (error) {
                setError(error instanceof Error ? error.message : '保存失败。');
              }
            }}
          >
            <label className="m-field-label" htmlFor="resident-name">
              你的称呼
            </label>
            <input
              id="resident-name"
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="m-form-help">称呼用于这台设备上的上报记录，无需填写真实姓名。</p>
            {error && (
              <p role="alert" className="m-field-error">
                {error}
              </p>
            )}
            <button className="m-button full">
              <Check size={17} />
              保存称呼
            </button>
          </form>
        ) : panel === 'help' ? (
          <div className="m-prose">
            <p>
              <strong>1. 发现问题，随手上报</strong>
              <br />
              填写具体情况，在实景底图上标记位置，按需添加现场照片。
            </p>
            <p>
              <strong>2. 不方便打字，就说一说</strong>
              <br />
              语音服务开通后，按住按钮录音，松开识别并整理。向上滑动可取消。
            </p>
            <p>
              <strong>3. 办到哪里，随时查看</strong>
              <br />
              在「我的上报」查看办理进度。草稿会在本机保存。
            </p>
          </div>
        ) : (
          <div className="m-prose">
            <p>乡居共治，让每位村民都能参与家门口的环境治理。</p>
            <p>
              村庄底图由电脑管理端共享，自动跟随真实村庄的3D模型更新。上报和照片保存在本地服务，与管理端同步。草稿按村庄分别保存在当前浏览器；当前还没有正式账号。
            </p>
            <p>
              语音功能使用阿里云百炼处理音频与转写文字，整理后由你核对。服务端不保存音频，照片不会发送给语音模型。
            </p>
            <p>清除浏览器站点数据会移除草稿和本机身份。真实上线需接入村庄业务后台及身份认证。</p>
          </div>
        )}
      </dialog>
    </div>
  );
}
