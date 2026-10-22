import {
  Maximize2,
  Eye,
  Sun,
  Moon,
  Building2,
  MapPin,
  Wrench,
  Map,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export default function SceneControls({ onResetView, onTopView, onUpload, uploading, uploadOpen, localModel }: {
  onResetView?: () => void;
  onTopView?: () => void;
  onUpload?: () => void;
  uploading?: boolean;
  uploadOpen?: boolean;
  localModel?: boolean;
}) {
  const timeMode = useAppStore((state) => state.timeMode);
  const setTimeMode = useAppStore((state) => state.setTimeMode);
  const showBuildings = useAppStore((state) => state.showBuildings);
  const showIssues = useAppStore((state) => state.showIssues);
  const showRenovations = useAppStore((state) => state.showRenovations);
  const toggleBuildings = useAppStore((state) => state.toggleBuildings);
  const toggleIssues = useAppStore((state) => state.toggleIssues);
  const toggleRenovations = useAppStore((state) => state.toggleRenovations);

  const controls = [
    {
      label: '重置视角',
      icon: Maximize2,
      onClick: onResetView,
    },
    {
      label: '俯视视角',
      icon: Eye,
      onClick: onTopView,
    },
    {
      label: timeMode === 'day' ? '切换夜间' : '切换日间',
      icon: timeMode === 'day' ? Moon : Sun,
      onClick: () => setTimeMode(timeMode === 'day' ? 'night' : 'day'),
      active: timeMode === 'night',
    },
    {
      label: '实景图层',
      icon: Building2,
      onClick: toggleBuildings,
      active: showBuildings,
    },
    {
      label: '问题图层',
      icon: MapPin,
      onClick: toggleIssues,
      active: showIssues,
    },
    {
      label: '微更新方案',
      icon: Wrench,
      onClick: toggleRenovations,
      active: showRenovations,
      disabled: localModel,
    },
  ];

  return (
    <div className="scene-toolbar" role="toolbar" aria-label="场景视角与图层">
      <div className="scene-toolbar-inner">
        <button type="button" className={`scene-button model-upload-toggle ${uploadOpen ? 'is-active' : ''}`} onClick={onUpload} aria-expanded={uploadOpen} aria-controls="model-upload-workspace"><Map size={17} strokeWidth={1.8} /><span>{uploading ? '地图处理中…' : '地图设置'}</span></button>
        {controls.map((control, index) => {
          const Icon = control.icon;
          return (
            <button
              key={index}
              onClick={control.onClick}
              type="button"
              disabled={control.disabled}
              aria-pressed={control.active}
              className={`scene-button ${control.active ? 'is-active' : ''} ${index === 2 || index === 3 ? 'has-divider' : ''}`}
              title={control.label}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{control.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
