import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRecorder } from '../adapters/browserMedia';
import { voiceGateway } from '../adapters/voiceHttp';
import type { VoiceFields } from '../domain/report';
export type VoicePhase =
  'idle' | 'preparing' | 'recording' | 'transcribing' | 'formatting' | 'error';
export function useVoiceCapture(onFields: (fields: VoiceFields) => void) {
  const [recorder] = useState(() => new BrowserRecorder()),
    [phase, setPhase] = useState<VoicePhase>('idle'),
    [enabled, setEnabled] = useState<boolean | null>(null),
    [error, setError] = useState(''),
    [transcript, setTranscript] = useState(''),
    [elapsed, setElapsed] = useState(0);
  const phaseRef = useRef<VoicePhase>('idle'),
    pressed = useRef(false),
    generation = useRef(0),
    controller = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    alive = useRef(true);
  const change = (next: VoicePhase) => {
    phaseRef.current = next;
    if (alive.current) setPhase(next);
  };
  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const cancel = useCallback(() => {
    generation.current++;
    pressed.current = false;
    controller.current?.abort();
    recorder.cancel();
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    phaseRef.current = 'idle';
    if (alive.current) setPhase('idle');
  }, [recorder]);
  useEffect(() => {
    alive.current = true;
    void voiceGateway
      .config()
      .then((config) => {
        if (alive.current) setEnabled(config.enabled);
      })
      .catch(() => {
        if (alive.current) setEnabled(false);
      });
    const hidden = () => {
      if (document.hidden && ['preparing', 'recording'].includes(phaseRef.current)) cancel();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      alive.current = false;
      cancel();
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [recorder, cancel]);
  const runFormat = async (text: string, token: number, signal: AbortSignal) => {
    change('formatting');
    const fields = await voiceGateway.format(text, signal);
    if (token !== generation.current || !alive.current) return;
    onFields(fields);
    setError('');
    change('idle');
  };
  const release = async (discard = false) => {
    pressed.current = false;
    if (phaseRef.current === 'preparing') {
      cancel();
      return;
    }
    if (phaseRef.current !== 'recording') return;
    clearTimer();
    if (discard) {
      cancel();
      return;
    }
    const token = ++generation.current,
      request = new AbortController();
    controller.current = request;
    try {
      change('transcribing');
      const clip = await recorder.stop();
      if (token !== generation.current) return;
      const text = await voiceGateway.transcribe(clip, request.signal);
      if (token !== generation.current || !alive.current) return;
      setTranscript(text);
      await runFormat(text, token, request.signal);
    } catch (error) {
      if (token === generation.current && alive.current) {
        setError(error instanceof Error ? error.message : '没有听清楚，请重试。');
        change('error');
      }
    }
  };
  const begin = async () => {
    if (!['idle', 'error'].includes(phaseRef.current)) return;
    if (!enabled) {
      setError(
        enabled === null ? '正在连接语音服务，请稍候。' : '语音服务暂未开通，可先使用文字填写。',
      );
      change('error');
      return;
    }
    const token = ++generation.current;
    pressed.current = true;
    setError('');
    setElapsed(0);
    change('preparing');
    try {
      await recorder.start();
      if (token !== generation.current || !pressed.current) {
        recorder.cancel();
        return;
      }
      change('recording');
      const start = Date.now();
      timer.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - start) / 1000);
        setElapsed(seconds);
        if (seconds >= 60) void release();
      }, 200);
    } catch (error) {
      if (token === generation.current && alive.current) {
        setError(error instanceof Error ? error.message : '录音启动失败。');
        change('error');
      }
    }
  };
  const retryFormat = async () => {
    if (!transcript.trim()) return;
    const token = ++generation.current,
      request = new AbortController();
    controller.current = request;
    setError('');
    try {
      await runFormat(transcript, token, request.signal);
    } catch (error) {
      if (token === generation.current) {
        setError(error instanceof Error ? error.message : '整理失败，请重试。');
        change('error');
      }
    }
  };
  return {
    phase,
    enabled,
    error,
    transcript,
    setTranscript,
    elapsed,
    begin,
    release,
    cancel,
    retryFormat,
    busy: ['preparing', 'recording', 'transcribing', 'formatting'].includes(phase),
  };
}
