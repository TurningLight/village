import { useEffect, useRef, useState } from 'react';
import { Mic, LoaderCircle, Square, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { useVoiceCapture } from '../services/useVoiceCapture';
import type { VoiceFields } from '../domain/report';
export default function VoiceInput({
  onFields,
  onBusy,
}: {
  onFields: (fields: VoiceFields) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const voice = useVoiceCapture(onFields),
    startY = useRef(0),
    pointer = useRef<number | null>(null),
    holding = useRef(false),
    [discard, setDiscard] = useState(false),
    [showText, setShowText] = useState(false);
  useEffect(() => onBusy?.(voice.busy), [voice.busy, onBusy]);
  const processing = voice.phase === 'transcribing' || voice.phase === 'formatting';
  const begin = () => {
    holding.current = true;
    setDiscard(false);
    void voice.begin();
  };
  const end = (cancel = false) => {
    if (!holding.current) return;
    holding.current = false;
    void voice.release(cancel);
  };
  return (
    <section
      className={`m-voice ${voice.phase === 'recording' ? 'is-recording' : ''}`}
      aria-label="语音辅助填写"
    >
      <div className="m-voice-intro">
        <Mic size={19} />
        <strong>不方便打字？说一说</strong>
        <span>语音辅助</span>
      </div>
      <p>说清楚在哪里、发生了什么，帮你整理成文字。</p>
      <button
        type="button"
        className={`m-hold-button ${discard ? 'will-cancel' : ''}`}
        aria-label="按住说话，松开识别"
        aria-busy={processing}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0 || !e.isPrimary || processing || holding.current) return;
          e.preventDefault();
          startY.current = e.clientY;
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          begin();
        }}
        onPointerMove={(e) => {
          if (holding.current && pointer.current === e.pointerId)
            setDiscard(e.clientY < startY.current - 65);
        }}
        onPointerUp={(e) => {
          if (pointer.current !== e.pointerId) return;
          pointer.current = null;
          end(e.clientY < startY.current - 65);
        }}
        onPointerCancel={(e) => {
          if (pointer.current !== e.pointerId) return;
          pointer.current = null;
          end(true);
          voice.cancel();
        }}
        onLostPointerCapture={() => {
          if (holding.current) end(true);
        }}
        onKeyDown={(e) => {
          if (
            (e.key === ' ' || e.key === 'Enter') &&
            !e.repeat &&
            !processing &&
            !holding.current
          ) {
            e.preventDefault();
            begin();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            end();
          }
        }}
      >
        {processing || voice.phase === 'preparing' ? (
          <LoaderCircle size={22} className="m-spin" />
        ) : (
          <Mic size={23} />
        )}
        <span>
          {voice.phase === 'preparing'
            ? '正在准备麦克风…'
            : voice.phase === 'recording'
              ? discard
                ? '松开取消'
                : `松开识别 · ${voice.elapsed}s`
              : voice.phase === 'transcribing'
                ? '正在把语音转成文字…'
                : voice.phase === 'formatting'
                  ? '正在整理问题信息…'
                  : '按住说话'}
        </span>
        {voice.phase === 'recording' && (
          <span className="m-voice-level" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
      </button>
      {voice.phase === 'recording' ? (
        <p className="m-voice-hint">上滑取消 · 最长 60 秒</p>
      ) : (
        <p className="m-voice-hint">松开后识别并整理，提交前请核对。音频不保存。</p>
      )}
      {voice.enabled === false && !voice.error && (
        <p className="m-inline-note">语音服务暂未开通，文字和照片上报可正常使用。</p>
      )}
      {voice.error && (
        <p className="m-field-error" role="alert">
          {voice.error}
        </p>
      )}
      {voice.busy && (
        <button type="button" className="m-text-button" onClick={voice.cancel}>
          <Square size={13} />
          取消{processing ? '处理' : '录音'}
        </button>
      )}
      {voice.transcript && (
        <div className="m-transcript">
          <button type="button" onClick={() => setShowText(!showText)} className="m-text-button">
            语音原文 {showText ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {showText && (
            <>
              <textarea
                aria-label="语音识别原文"
                value={voice.transcript}
                onChange={(e) => voice.setTranscript(e.target.value)}
                maxLength={6000}
              />
              <button
                type="button"
                onClick={() => void voice.retryFormat()}
                disabled={voice.busy}
                className="m-text-button"
              >
                <RotateCcw size={14} />
                重新整理原文
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
