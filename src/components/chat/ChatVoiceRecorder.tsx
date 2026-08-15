import { Mic, Square, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

function pickMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function formatSeconds(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ChatVoiceRecorder({
  disabled,
  onRecorded,
  onRecordingChange,
}: {
  disabled?: boolean;
  onRecorded: (file: File) => void;
  onRecordingChange?: (recording: boolean) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not supported in this browser');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      cancelledRef.current = false;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (!cancelledRef.current && chunksRef.current.length > 0) {
          const type = mimeType || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type });
          const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
          const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
          onRecorded(file);
        }
        cleanup();
        setRecording(false);
        setSeconds(0);
      };

      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError('Microphone access denied');
      cleanup();
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    } else {
      cleanup();
      setRecording(false);
      setSeconds(0);
    }
  };

  if (recording) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-2 py-1">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          <span className="text-xs font-medium text-red-300">{formatSeconds(seconds)}</span>
        </div>
        <button
          type="button"
          onClick={cancelRecording}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
          title="Cancel recording"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={stopRecording}
          className="rounded p-1.5 bg-red-600 text-white hover:bg-red-500"
          title="Stop and attach"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void startRecording()}
        disabled={disabled}
        className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300 disabled:opacity-40"
        title="Record voice message"
      >
        <Mic className="h-3.5 w-3.5" />
      </button>
      {error && (
        <span className="absolute bottom-full left-0 mb-1 whitespace-nowrap rounded bg-red-900/90 px-2 py-0.5 text-[10px] text-red-200">
          {error}
        </span>
      )}
    </div>
  );
}
