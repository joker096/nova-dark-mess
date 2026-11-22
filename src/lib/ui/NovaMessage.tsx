import { forwardRef, type HTMLAttributes, type ReactNode, useMemo } from 'react';
import { ChevronRight, Download, Play, FileText, Image as ImageIcon, Link2, X, Reply, Share2 } from 'lucide-react';
import { NovaAvatar } from './NovaAvatar';
import { NovaBadge } from './NovaBadge';
import { NovaReactionChips } from './NovaReactionChips';
import { LazyMedia } from '../../components/LazyMedia';
import { formatCount } from './formatCount';

export interface MessageReaction {
  emoji: string;
  count: number;
  fromMe?: boolean;
}

export interface MessageReply {
  authorName: string;
  text: string;
  isOwn?: boolean;
}

export interface MessageForward {
  authorName: string;
  text: string;
}

export interface MessageLinkPreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
}

export interface MessageFile {
  name: string;
  size: number;
  url: string;
  mimeType?: string;
}

export interface MessageImage {
  url: string;
  width?: number;
  height?: number;
  caption?: string;
}

export interface MessageVideo {
  url: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  duration?: number;
  caption?: string;
}

export interface NovaMessageProps extends HTMLAttributes<HTMLDivElement> {
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  time: string;
  text?: string;
  reactions?: MessageReaction[];
  replyCount?: number;
  replyPreview?: MessageReply;
  forward?: MessageForward;
  linkPreview?: MessageLinkPreview;
  file?: MessageFile;
  image?: MessageImage;
  video?: MessageVideo;
  isOwn?: boolean;
  showAvatar?: boolean;
  showName?: boolean;
  grouped?: boolean;
  onReply?: () => void;
  onForward?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onReactionClick?: (emoji: string) => void;
  onAvatarClick?: () => void;
  onTextClick?: () => void;
  onMediaClick?: (media: MessageImage | MessageVideo) => void;
}

const SENDER_COLORS = [
  'var(--c-name-1)',
  'var(--c-name-2)',
  'var(--c-name-3)',
  'var(--c-name-4)',
  'var(--c-name-5)',
  'var(--c-name-6)',
  'var(--c-name-7)',
  'var(--c-name-8)',
];

function getSenderColor(senderId: string): string {
  let hash = 0;
  for (let i = 0; i < senderId.length; i++) {
    hash = senderId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const NovaMessage = forwardRef<HTMLDivElement, NovaMessageProps>(
  ({
    senderId,
    senderName,
    senderAvatar,
    time,
    text,
    reactions,
    replyCount,
    replyPreview,
    forward,
    linkPreview,
    file,
    image,
    video,
    isOwn = false,
    showAvatar = true,
    showName = true,
    grouped = false,
    onReply,
    onForward,
    onEdit,
    onDelete,
    onCopy,
    onReactionClick,
    onAvatarClick,
    onTextClick,
    onMediaClick,
    className,
    style,
    children,
    ...props
  }, ref) => {
    const senderColor = useMemo(() => getSenderColor(senderId), [senderId]);

    const messageContent = useMemo(() => {
      const content: ReactNode[] = [];

      if (replyPreview) {
        content.push(
          <div
            key="reply"
            className="mb-2 pl-2 border-l-2 border-[var(--c-primary)] bg-[var(--bg-quote)] rounded-r-[var(--radius-media)]"
            style={{ borderLeftWidth: '2px' } as React.CSSProperties}
          >
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] mb-1">
              <Reply className="w-3 h-3" aria-hidden="true" />
              <span>{replyPreview.isOwn ? 'You' : replyPreview.authorName}</span>
            </div>
            <p className="text-[14px] text-[var(--text-primary)] truncate" style={{ color: replyPreview.isOwn ? 'var(--c-primary)' : 'inherit' } as React.CSSProperties}>
              {replyPreview.text}
            </p>
          </div>
        );
      }

      if (forward) {
        content.push(
          <div
            key="forward"
            className="mb-2 pl-2 border-l-2 border-[var(--c-forward)] bg-[var(--bg-quote)] rounded-r-[var(--radius-media)]"
            style={{ borderLeftWidth: '2px' } as React.CSSProperties}
          >
            <div className="flex items-center gap-1.5 text-xs text-[var(--c-forward)] font-medium mb-1">
              <Share2 className="w-3 h-3" aria-hidden="true" />
              <span>Forwarded from {forward.authorName}</span>
            </div>
            <p className="text-[14px] text-[var(--text-primary)]">{forward.text}</p>
          </div>
        );

      if (linkPreview) {
        content.push(
          <div
            key="link"
            className="mb-2 bg-[var(--bg-quote)] border border-[var(--border-divider)] rounded-[var(--radius-media)] overflow-hidden"
            onClick={() => onTextClick?.()}
            style={{ cursor: onTextClick ? 'pointer' : 'default' } as React.CSSProperties}
          >
            <div className="flex">
              <div className="w-3" style={{ backgroundColor: 'var(--c-primary)' } as React.CSSProperties} />
              <div className="flex-1 p-3 min-w-0">
                <p className="text-xs font-medium text-[var(--c-primary)] truncate">{linkPreview.siteName ?? new URL(linkPreview.url).hostname}</p>
                <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate mt-0.5">{linkPreview.title}</p>
                {linkPreview.description && (
                  <p className="text-[13px] text-[var(--text-secondary)] truncate mt-1 line-clamp-2">{linkPreview.description}</p>
                )}
              </div>
              {linkPreview.image && (
                <div className="w-[80px] h-[80px] shrink-0 relative" style={{ flexShrink: 0 } as React.CSSProperties}>
                  <LazyMedia src={linkPreview.image} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>
        );
      }

      if (image) {
        content.push(
          <div
            key="image"
            className="mb-2 rounded-[var(--radius-media)] overflow-hidden"
            onClick={() => onMediaClick?.(image)}
            style={{ cursor: onMediaClick ? 'pointer' : 'default' } as React.CSSProperties}
          >
            <LazyMedia
              src={image.url}
              alt={image.caption ?? 'Image'}
              className="w-full max-w-[280px] rounded-[var(--radius-media)] object-cover"
            />
            {image.caption && (
              <p className="text-[14px] text-[var(--text-primary)] mt-1">{image.caption}</p>
            )}
          </div>
        );
      }

      if (video) {
        content.push(
          <div
            key="video"
            className="mb-2 rounded-[var(--radius-media)] overflow-hidden relative"
            onClick={() => onMediaClick?.(video)}
            style={{ cursor: onMediaClick ? 'pointer' : 'default' } as React.CSSProperties}
          >
            <LazyMedia
              src={video.thumbnail ?? video.url}
              alt={video.caption ?? 'Video'}
              className="w-full max-w-[280px] rounded-[var(--radius-media)] object-cover"
            />
            <button
              type="button"
              className="absolute inset-0 flex items-center justify-center"
              aria-label="Play video"
            >
              <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white transition-transform hover:scale-110">
                <Play className="w-6 h-6 ml-1" aria-hidden="true" />
              </div>
            </button>
            {video.caption && (
              <p className="text-[14px] text-[var(--text-primary)] mt-1">{video.caption}</p>
            )}
          </div>
        );
      }

      if (file) {
        content.push(
          <div
            key="file"
            className="mb-2 flex items-center gap-3 p-3 bg-[var(--bg-field)] rounded-[var(--radius-media)] max-w-[280px]"
            onClick={() => onTextClick?.()}
            style={{ cursor: onTextClick ? 'pointer' : 'default' } as React.CSSProperties}
          >
            <button
              type="button"
              className="w-10 h-10 rounded-full bg-[var(--c-primary)]/15 flex items-center justify-center text-[var(--c-primary)] shrink-0"
              aria-label="Download file"
            >
              {file.mimeType?.startsWith('image/') ? (
                <ImageIcon className="w-5 h-5" />
              ) : file.mimeType?.startsWith('video/') ? (
                <Play className="w-5 h-5 ml-1" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-[var(--c-primary)] truncate">{file.name}</p>
              <p className="text-[13px] text-[var(--text-secondary)]">{formatFileSize(file.size)}</p>
            </div>
            <button
              type="button"
              className="w-9 h-9 rounded-full bg-[var(--c-primary)] text-[var(--c-on-primary)] flex items-center justify-center shrink-0"
              aria-label="Download"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        );
      }

      if (text) {
        content.push(
          <p
            key="text"
            className="text-[16px] leading-[24px] text-[var(--text-primary)] break-words"
            onClick={() => onTextClick?.()}
            style={{ cursor: onTextClick ? 'pointer' : 'default' } as React.CSSProperties}
          >
            {text}
          </p>
        );
      }

      return content;
    }
    }, [
      replyPreview,
      forward,
      linkPreview,
      image,
      video,
      file,
      text,
      onTextClick,
      onMediaClick,
    ]);

    return (
      <div
        ref={ref}
        className={`flex gap-2 ${grouped ? 'pl-12' : ''} ${className ?? ''}`}
        style={style}
        {...props}
      >
        {showAvatar && !grouped && (
          <NovaAvatar
            src={senderAvatar}
            alt={senderName}
            name={senderName}
            size="m"
            onClick={onAvatarClick}
            style={{ cursor: onAvatarClick ? 'pointer' : 'default' } as React.CSSProperties}
          />
        )}
        {showAvatar && grouped && <div className="w-10 shrink-0" />}

        <div className="flex-1 min-w-0">
          {!grouped && showName && (
            <div className="flex items-baseline gap-2 mb-1">
              <span
                className="text-[13px] font-medium leading-[20px]"
                style={{ color: senderColor } as React.CSSProperties}
              >
                {isOwn ? 'You' : senderName}
              </span>
              <span className="text-[12px] text-[var(--text-secondary)] whitespace-nowrap">{time}</span>
            </div>
          )}

          <div className={grouped ? 'pl-2' : ''}>
            {messageContent}
          </div>

          {(reactions && reactions.length > 0) || (replyCount && replyCount > 0) && (
            <div className="flex items-center gap-2 mt-2">
              {reactions && reactions.length > 0 && (
                <NovaReactionChips
                  reactions={reactions}
                  onReactionClick={onReactionClick}
                />
              )}
              {replyCount && replyCount > 0 && (
                <button
                  type="button"
                  onClick={onReply}
                  className="flex items-center gap-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  aria-label={`${replyCount} replies`}
                >
                  <Reply className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{formatCount(replyCount)} replies</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);

NovaMessage.displayName = 'NovaMessage';