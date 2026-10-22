import { useEffect, useRef, useState } from 'react';
import {
  Leaf,
  Calendar,
  Activity,
  Check,
  ChevronDown,
  ClipboardList,
  PanelsTopLeft,
} from 'lucide-react';
import './header-navigation.css';
export type DesktopPage = 'workspace' | 'governance';
const pages = [
  {
    id: 'workspace' as const,
    title: '可视化事件处理工作台',
    description: '实景定位 · 事件受理与办结',
    Icon: ClipboardList,
  },
  {
    id: 'governance' as const,
    title: '智慧治理终端',
    description: '办结留痕 · 月度总结与治理分析',
    Icon: PanelsTopLeft,
  },
];
export default function Header({
  modelName,
  online,
  demo,
  page = 'workspace',
  onPageChange,
}: {
  modelName?: string;
  online?: boolean;
  demo?: boolean;
  page?: DesktopPage;
  onPageChange?: (page: DesktopPage) => void;
}) {
  const [currentDate] = useState(() =>
    new Date().toLocaleDateString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }),
  );
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    menu.current?.querySelector<HTMLButtonElement>(`[aria-checked="true"]`)?.focus();
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const choose = (value: DesktopPage) => {
    setOpen(false);
    onPageChange?.(value);
    trigger.current?.focus();
  };
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="header-brand-group">
          <div className="header-page-switch" ref={root}>
            <button
              ref={trigger}
              className="brand-icon header-page-trigger"
              aria-label="切换事件工作台与智慧治理终端"
              title="切换工作台与智慧治理终端"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls="desktop-page-menu"
              onClick={() => setOpen(!open)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  setOpen(true);
                }
              }}
            >
              <Leaf size={28} />
              <ChevronDown className="header-page-chevron" size={11} />
            </button>
            {open && (
              <div
                id="desktop-page-menu"
                role="menu"
                aria-label="选择工作页面"
                ref={menu}
                className="header-page-menu"
                onKeyDown={(event) => {
                  const nodes = Array.from(
                    menu.current?.querySelectorAll<HTMLButtonElement>('button') || [],
                  );
                  const at = nodes.indexOf(document.activeElement as HTMLButtonElement);
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setOpen(false);
                    trigger.current?.focus();
                  } else if (event.key === 'Tab') setOpen(false);
                  else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault();
                    nodes[
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? nodes.length - 1
                          : (at + (event.key === 'ArrowDown' ? 1 : -1) + nodes.length) %
                            nodes.length
                    ]?.focus();
                  }
                }}
              >
                {pages.map(({ id, title, description, Icon }) => (
                  <button
                    key={id}
                    role="menuitemradio"
                    aria-checked={page === id}
                    onClick={() => choose(id)}
                  >
                    <Icon size={21} />
                    <span>
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                    {page === id && <Check size={17} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="header-brand-copy">
            <div className="header-title-line">
              <h1 className="brand-title">乡居共治</h1>
              <span className="header-page-name">
                {page === 'governance' ? '智慧治理终端' : '事件处理工作台'}
              </span>
            </div>
            <p className="header-model-name text-sm text-gray-500 font-medium" title={modelName}>
              {modelName
                ? `${modelName} · ${demo ? '程序化演示' : online ? '在线实景' : '本地实景'}`
                : '黎槎八卦村 · 治理演示'}
            </p>
          </div>
        </div>
        <div className="header-meta">
          <div className="header-date">
            <Calendar size={16} />
            <span className="text-sm font-medium">{currentDate}</span>
          </div>
          <div className="header-status">
            <Activity size={16} className="text-green-500" />
            <span className="text-sm font-medium">运行中</span>
          </div>
          <div className="header-avatar" aria-label="本机管理员">
            管
          </div>
        </div>
      </div>
    </header>
  );
}
