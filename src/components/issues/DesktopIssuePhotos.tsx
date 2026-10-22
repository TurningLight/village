import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ImageOff, RotateCcw, X } from 'lucide-react';
import './desktop-issue-photos.css';

function PhotoImage({ src, alt, large = false }: { src: string; alt: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="issue-photo-failure" role="status">
        <ImageOff size={large ? 28 : 20} aria-hidden="true" />
        <span>照片暂时无法显示</span>
        {large && (
          <button type="button" onClick={() => setFailed(false)}>
            <RotateCcw size={15} aria-hidden="true" />
            重试载入
          </button>
        )}
      </span>
    );
  return (
    <img
      src={src}
      alt={alt}
      loading={large ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

export default function DesktopIssuePhotos({
  images,
  title,
}: {
  images?: string[];
  title: string;
}) {
  const photos = images?.filter((src) => typeof src === 'string' && src.length > 0) ?? [];
  const [active, setActive] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    dialog.current?.close();
    setActive(null);
  }, [pathname]);
  const close = () => {
    dialog.current?.close();
    setActive(null);
  };
  const open = (index: number) => {
    setActive(index);
    dialog.current?.showModal();
  };
  const move = (direction: number) =>
    setActive((index) => ((index ?? 0) + direction + photos.length) % photos.length);
  if (!photos.length) return null;
  const index = Math.min(active ?? 0, photos.length - 1);
  return (
    <section className="issue-photos" aria-label="上报现场照片">
      <div className="issue-photos-heading">
        <h3>
          现场照片 <span>{photos.length} 张</span>
        </h3>
        <span>点击查看大图</span>
      </div>
      <div className={`issue-photos-grid${photos.length === 1 ? ' single' : ''}`}>
        {photos.map((src, photoIndex) => (
          <button
            type="button"
            className="issue-photo-tile"
            key={`${photoIndex}:${src}`}
            aria-label={`查看第 ${photoIndex + 1} 张现场照片`}
            aria-haspopup="dialog"
            onClick={() => open(photoIndex)}
          >
            <PhotoImage src={src} alt={`${title}的现场照片 ${photoIndex + 1}`} />
          </button>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="issue-photo-viewer"
        aria-label={`${title}的现场照片预览`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (photos.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
            event.preventDefault();
            move(event.key === 'ArrowRight' ? 1 : -1);
          }
        }}
        onClick={(event) => {
          if (event.target !== dialog.current) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            close();
        }}
      >
        <header className="issue-photo-viewer-header">
          <div>
            <h2>现场照片</h2>
            <p>{title}</p>
          </div>
          <button type="button" aria-label="关闭照片预览" onClick={close} autoFocus>
            <X size={21} aria-hidden="true" />
          </button>
        </header>
        {active !== null && (
          <div className="issue-photo-viewer-image">
            <PhotoImage
              key={photos[index]}
              src={photos[index]}
              alt={`${title}的现场照片 ${index + 1}，大图`}
              large
            />
          </div>
        )}
        <footer className="issue-photo-viewer-footer">
          {photos.length > 1 && (
            <button type="button" aria-label="上一张照片" onClick={() => move(-1)}>
              <ChevronLeft size={18} aria-hidden="true" />
              上一张
            </button>
          )}
          <span aria-live="polite">
            第 {index + 1} / {photos.length} 张
          </span>
          {photos.length > 1 && (
            <button type="button" aria-label="下一张照片" onClick={() => move(1)}>
              下一张
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          )}
        </footer>
      </dialog>
    </section>
  );
}
