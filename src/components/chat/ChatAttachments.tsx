import { FileText } from 'lucide-react';
import BASE_URL from '@/lib/api';
import { ChatAudioPlayer } from '@/components/chat/ChatAudioPlayer';

type Attachment = {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
};

function fullUrl(path: string) {
  if (path.startsWith('http')) return path;
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function ChatAttachment({
  attachment,
  onImageClick,
}: {
  attachment: Attachment;
  onImageClick: (url: string) => void;
}) {
  const url = fullUrl(attachment.file_url);
  const mime = attachment.mime_type || '';

  if (mime.startsWith('image/')) {
    return (
      <button
        type="button"
        onClick={() => onImageClick(url)}
        className="mt-1.5 block max-w-sm overflow-hidden rounded-lg border border-gray-700 bg-black/20 text-left transition hover:border-gray-500"
      >
        <img
          src={url}
          alt={attachment.file_name}
          className="max-h-72 w-full object-contain"
          loading="lazy"
        />
      </button>
    );
  }

  if (mime.startsWith('video/')) {
    return (
      <div className="mt-1.5 max-w-sm overflow-hidden rounded-lg border border-gray-700 bg-black/40">
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="max-h-72 w-full"
        >
          <track kind="captions" />
        </video>
        <p className="px-2 py-1 text-[10px] text-gray-500">{attachment.file_name}</p>
      </div>
    );
  }

  if (mime.startsWith('audio/')) {
    return <ChatAudioPlayer url={url} />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-1.5 inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800"
    >
      <FileText className="h-4 w-4 text-gray-400" />
      <span>{attachment.file_name}</span>
      {attachment.file_size ? (
        <span className="text-gray-500">{Math.round(attachment.file_size / 1024)} KB</span>
      ) : null}
    </a>
  );
}
