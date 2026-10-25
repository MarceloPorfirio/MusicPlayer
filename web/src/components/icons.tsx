import type { SVGProps } from 'react';

const base = (d: string) => (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden {...props}>
    <path d={d} />
  </svg>
);

export const PlayIcon = base('M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z');
export const PauseIcon = base('M6 5h4v14H6zM14 5h4v14h-4z');
export const NextIcon = base('M6 6l8.5 6L6 18V6zm10 0h2v12h-2z');
export const PrevIcon = base('M18 6l-8.5 6 8.5 6V6zM6 6h2v12H6z');
export const PlusIcon = base('M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z');
export const TrashIcon = base('M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 12H7L6 9z');
export const RetryIcon = base('M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z');
export const ShuffleIcon = base('M10.6 9.2 5.4 4 4 5.4l5.2 5.2 1.4-1.4zM14.5 4l2 2L4 18.6 5.4 20 18 7.5l2 2V4h-5.5zm.3 9.4-1.4 1.4 3.1 3.1-2 2.1H20v-5.5l-2 2-3.2-3.1z');
export const EditIcon = base('M4 17.25V20h2.75L17.8 8.94l-2.75-2.75L4 17.25zM20.7 6.04a1 1 0 0 0 0-1.41l-1.33-1.33a1 1 0 0 0-1.41 0l-1.13 1.13 2.75 2.75 1.12-1.14z');
export const MoreIcon = base('M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z');
export const DownloadIcon = base('M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z');
export const SavedIcon = base('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.2-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4-7 7z');
export const RepeatIcon = base('M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z');
export const RepeatOneIcon = base('M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zM13 15V9h-1l-2 1v1h1.5v4H13z');
export const ChevronDownIcon = base('M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z');
export const CloseIcon = base('M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z');
export const QueueNextIcon = base('M3 10h11v2H3v-2zm0-4h11v2H3V6zm0 8h7v2H3v-2zm13-1v8l6-4-6-4z');
export const QueueAddIcon = base('M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z');
export const DragIcon = base('M9 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM9 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM9 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z');
export const MusicIcon = base('M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z');
