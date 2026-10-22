import type { AudioClip, RecorderPort } from './contracts';
import { encodeWav } from '../domain/audio';
export class BrowserRecorder implements RecorderPort {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private generation = 0;
  private started = 0;
  private chunks: Blob[] = [];
  async start() {
    this.cancel();
    const generation = this.generation;
    if (!window.isSecureContext) throw new Error('录音需要安全连接，请使用 HTTPS 打开页面。');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
      throw new Error('当前浏览器暂不支持录音，请使用文字填写。');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
    } catch (error) {
      if ((error as DOMException).name === 'NotAllowedError')
        throw new Error('麦克风未获允许，请在浏览器设置中开启，或使用文字填写。');
      throw new Error('暂时无法使用麦克风，请检查是否被其他应用占用。');
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      throw new DOMException('已取消', 'AbortError');
    }
    this.stream = stream;
    this.chunks = [];
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    try {
      this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) this.chunks.push(e.data);
      };
      this.recorder.start(200);
      this.started = Date.now();
    } catch {
      this.cancel();
      throw new Error('录音启动失败，请使用文字填写或更换浏览器。');
    }
  }
  async stop(): Promise<AudioClip> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') {
      this.cancel();
      throw new Error('录音尚未准备好，请再次长按。');
    }
    this.recorder = null;
    const raw = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        resolve(new Blob(this.chunks, { type: recorder.mimeType }));
      };
      recorder.onerror = () => {
        this.cancel();
        reject(new Error('录音失败，请重试。'));
      };
      recorder.stop();
    });
    const durationMs = Date.now() - this.started;
    if (durationMs < 600 || raw.size < 100)
      throw new Error('录音有点短，请按住说完整的问题再松开。');
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await raw.arrayBuffer());
      if (decoded.duration > 61) throw new Error('请将每段语音控制在一分钟内。');
      const offline = new OfflineAudioContext(
          1,
          Math.max(1, Math.ceil(decoded.duration * 16000)),
          16000,
        ),
        source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const pcm = await offline.startRendering();
      return {
        blob: new Blob([encodeWav(pcm.getChannelData(0))], { type: 'audio/wav' }),
        durationMs,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('一分钟')) throw error;
      throw new Error('录音转换失败，请重新录音，或使用文字填写。');
    } finally {
      void context.close();
      this.chunks = [];
    }
  }
  cancel() {
    this.generation++;
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onstop = null;
      this.recorder.onerror = null;
      if (this.recorder.state !== 'inactive') this.recorder.stop();
      this.recorder = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.chunks = [];
  }
}
export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024)
    throw new Error('请选择 12MB 以内的照片。');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('照片无法读取，请使用 JPG、PNG 或 WebP 图片。'));
      image.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height)),
      canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('照片处理失败，请重新选择。');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/jpeg', 0.76);
    if (data.length > 500000) data = canvas.toDataURL('image/jpeg', 0.5);
    if (data.length > 650000) throw new Error('照片内容过大，请选择尺寸较小的图片。');
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
