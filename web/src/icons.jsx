import React from 'react';

function Base({ size = 20, strokeWidth = 1.7, children, ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

const make = (render) =>
  function Icon({ size = 20, ...rest }) {
    return (
      <Base size={size} {...rest}>
        {render}
      </Base>
    );
  };

export const Folder = make(
  <path d="M3 7.6A2.6 2.6 0 0 1 5.6 5h3.1a2 2 0 0 1 1.5.68l1.05 1.24A2 2 0 0 0 12.72 7.6h5.68A2.6 2.6 0 0 1 21 10.2v6.2A2.6 2.6 0 0 1 18.4 19H5.6A2.6 2.6 0 0 1 3 16.4V7.6Z" />
);

export const FolderOpen = make(
  <>
    <path d="M3 7.6A2.6 2.6 0 0 1 5.6 5h3.1a2 2 0 0 1 1.5.68l1.05 1.24A2 2 0 0 0 12.72 7.6h5.68A2.6 2.6 0 0 1 21 10.2v.8" />
    <path d="M3.4 18.5 5 11.4A2 2 0 0 1 6.95 9.9H20a1.6 1.6 0 0 1 1.56 1.98l-1.4 6.6A2 2 0 0 1 18.2 20H5.4a2 2 0 0 1-2-1.5Z" />
  </>
);

export const File = make(
  <>
    <path d="M14 3v5a2 2 0 0 0 2 2h5" />
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10l-5-7Z" />
  </>
);

export const Image = make(
  <>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="8.5" cy="9.5" r="1.6" />
    <path d="m4 17 4.2-4.2a2 2 0 0 1 2.8 0L16 17.8M14.5 15l1.8-1.8a2 2 0 0 1 2.8 0L21 15.6" />
  </>
);

export const Video = make(
  <>
    <rect x="3" y="5" width="13" height="14" rx="3" />
    <path d="m16 10.5 4.2-2.6a.8.8 0 0 1 1.2.7v6.8a.8.8 0 0 1-1.2.7L16 13.5" />
  </>
);

export const Music = make(
  <>
    <path d="M9 17V6.2a1 1 0 0 1 .8-1l8.4-1.6a1 1 0 0 1 1.2 1V15" />
    <circle cx="6.5" cy="17.5" r="2.5" />
    <circle cx="16.5" cy="15.5" r="2.5" />
  </>
);

export const Archive = make(
  <>
    <rect x="3" y="4" width="18" height="5" rx="1.6" />
    <path d="M4.5 9v9.4A1.6 1.6 0 0 0 6.1 20H18a1.6 1.6 0 0 0 1.6-1.6V9" />
    <path d="M10.5 13h3" />
  </>
);

export const Code = make(
  <>
    <path d="m8.5 8.5-4 3.5 4 3.5M15.5 8.5l4 3.5-4 3.5M13 5.5l-2 13" />
  </>
);

export const Pdf = make(
  <>
    <path d="M14 3v5a2 2 0 0 0 2 2h5" />
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10l-5-7Z" />
    <path d="M8.5 16.5v-3.2h1.1a1.1 1.1 0 0 1 0 2.2H8.5M13.3 16.5v-3.2h1.2a1.6 1.6 0 0 1 0 3.2h-1.2Z" />
  </>
);

export const Doc = make(
  <>
    <path d="M14 3v5a2 2 0 0 0 2 2h5" />
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10l-5-7Z" />
    <path d="M8.5 13h7M8.5 16.5h4.5" />
  </>
);

export const TextFile = make(
  <>
    <path d="M14 3v5a2 2 0 0 0 2 2h5" />
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10l-5-7Z" />
    <path d="M8.5 12.5h7M8.5 16h5" />
  </>
);

export const Upload = make(
  <>
    <path d="M12 16.5V4.5M12 4.5 7.8 8.7M12 4.5l4.2 4.2" />
    <path d="M4 15.5v2.3A2.2 2.2 0 0 0 6.2 20h11.6a2.2 2.2 0 0 0 2.2-2.2v-2.3" />
  </>
);

export const Download = make(
  <>
    <path d="M12 4.5v12M12 16.5 7.8 12.3M12 16.5l4.2-4.2" />
    <path d="M4 15.5v2.3A2.2 2.2 0 0 0 6.2 20h11.6a2.2 2.2 0 0 0 2.2-2.2v-2.3" />
  </>
);

export const Plus = make(<path d="M12 5.5v13M5.5 12h13" />);

export const FolderPlus = make(
  <>
    <path d="M21 12.5V10.2A2.6 2.6 0 0 0 18.4 7.6h-5.68a2 2 0 0 1-1.47-.68L10.2 5.68A2 2 0 0 0 8.7 5H5.6A2.6 2.6 0 0 0 3 7.6v8.8A2.6 2.6 0 0 0 5.6 19h8" />
    <path d="M17.5 14.5v5M15 17h5" />
  </>
);

export const Search = make(
  <>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="m15.5 15.5 4.2 4.2" />
  </>
);

export const Grid = make(
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </>
);

export const ListIcon = make(
  <>
    <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" />
    <circle cx="4" cy="6.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="17.5" r="1" fill="currentColor" stroke="none" />
  </>
);

export const ChevronRight = make(<path d="m9.5 5.5 6.5 6.5-6.5 6.5" />);
export const ChevronLeft = make(<path d="m14.5 5.5-6.5 6.5 6.5 6.5" />);
export const ChevronDown = make(<path d="m5.5 9.5 6.5 6.5 6.5-6.5" />);
export const ArrowUp = make(<path d="M12 19V5M12 5 5.5 11.5M12 5l6.5 6.5" />);

export const Close = make(<path d="m6 6 12 12M18 6 6 18" />);
export const Check = make(<path d="m5 12.8 4.3 4.2L19 6.8" />);

export const More = ({ size = 20, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
    <circle cx="5.5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="18.5" cy="12" r="1.7" />
  </svg>
);

export const Trash = make(
  <>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7" />
    <path d="M6.4 7.5 7.3 19a1.8 1.8 0 0 0 1.8 1.7h5.8a1.8 1.8 0 0 0 1.8-1.7l.9-11.5" />
    <path d="M10.3 11v6M13.7 11v6" />
  </>
);

export const Pencil = make(
  <>
    <path d="M4 20h3.8L19 8.8a2.5 2.5 0 0 0-3.5-3.5L4.3 16.5 4 20Z" />
    <path d="m14.6 6.2 3.2 3.2" />
  </>
);

export const Move = make(
  <>
    <path d="M3 7.6A2.6 2.6 0 0 1 5.6 5h3.1a2 2 0 0 1 1.5.68l1.05 1.24A2 2 0 0 0 12.72 7.6h5.68A2.6 2.6 0 0 1 21 10.2v6.2A2.6 2.6 0 0 1 18.4 19H5.6A2.6 2.6 0 0 1 3 16.4V7.6Z" />
    <path d="M9 13.5h6M13 11l2.5 2.5L13 16" />
  </>
);

export const Copy = make(
  <>
    <rect x="9" y="9" width="11.5" height="11.5" rx="2.5" />
    <path d="M15 6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15" />
  </>
);

export const Info = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 8.2v.1" />
  </>
);

export const Settings = make(
  <>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 14.5a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.6 8.4a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.04h.08A1.7 1.7 0 0 0 10.1 2.5V2a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49 1.03Z" />
  </>
);

export const LogOut = make(
  <>
    <path d="M15.5 17.5 20.5 12l-5-5.5" />
    <path d="M20.5 12H9" />
    <path d="M12 3.5H6.5A2 2 0 0 0 4.5 5.5v13a2 2 0 0 0 2 2H12" />
  </>
);

export const Lock = make(
  <>
    <rect x="4.5" y="10" width="15" height="10.5" rx="3" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    <path d="M12 14.5v2" />
  </>
);

export const User = make(
  <>
    <circle cx="12" cy="8" r="3.8" />
    <path d="M4.8 20c.6-3.5 3.6-5.6 7.2-5.6s6.6 2.1 7.2 5.6" />
  </>
);

export const Shield = make(
  <>
    <path d="M12 3.2 19 6v5.6c0 4.4-2.9 7.7-7 9.2-4.1-1.5-7-4.8-7-9.2V6l7-2.8Z" />
    <path d="m9.2 12 2 2 3.6-3.8" />
  </>
);

export const Eye = make(
  <>
    <path d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12Z" />
    <circle cx="12" cy="12" r="2.9" />
  </>
);

export const EyeOff = make(
  <>
    <path d="M9.9 5.2A8.9 8.9 0 0 1 12 5c6 0 9.4 7 9.4 7a16 16 0 0 1-2.7 3.6M6.3 7.4A16.5 16.5 0 0 0 2.6 12S6 19 12 19a8.8 8.8 0 0 0 3.6-.75" />
    <path d="m4 4 16 16M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </>
);

export const Cloud = make(
  <path d="M7.1 18.5A4.1 4.1 0 0 1 6.6 10.3a5.9 5.9 0 0 1 11.3-1.1 4.65 4.65 0 0 1-.9 9.3H7.1Z" />
);

export const Refresh = make(
  <>
    <path d="M20 11.2A8 8 0 0 0 6.3 6.5L4 8.8" />
    <path d="M4 4.8v4h4" />
    <path d="M4 12.8a8 8 0 0 0 13.7 4.7L20 15.2" />
    <path d="M20 19.2v-4h-4" />
  </>
);

export const ArrowLeft = make(<path d="M19 12H5M5 12l6-6M5 12l6 6" />);

export const Home = make(
  <>
    <path d="m4 10.5 8-6.8 8 6.8V19a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 19v-8.5Z" />
    <path d="M9.5 20.8v-6.3h5v6.3" />
  </>
);

export const Keyboard = make(
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="2.6" />
    <path d="M6.5 10h.1M10 10h.1M13.5 10h.1M17 10h.1M6.5 13.5h.1M10 13.5h.1M13.5 13.5h.1M17 13.5h.1M8 16.5h8" />
  </>
);

export const Inbox = ({ size = 64, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    <path d="M3 13.5 5.4 6a2.5 2.5 0 0 1 2.4-1.7h8.4A2.5 2.5 0 0 1 18.6 6L21 13.5" />
    <path d="M3 13.5h4.3l1.2 2.4h6.9l1.2-2.4H21v3.9A2.6 2.6 0 0 1 18.4 20H5.6A2.6 2.6 0 0 1 3 17.4v-3.9Z" />
  </svg>
);

const KIND_MAP = {
  folder: Folder,
  image: Image,
  video: Video,
  audio: Music,
  archive: Archive,
  code: Code,
  pdf: Pdf,
  doc: Doc,
  text: TextFile,
  file: File,
};

export function KindGlyph({ kind, size = 18, ...rest }) {
  const Cmp = KIND_MAP[kind] || File;
  return <Cmp size={size} {...rest} />;
}

export default {
  Folder,
  File,
  Image,
  Video,
  Music,
  Archive,
  Code,
  Pdf,
  Doc,
  TextFile,
  Upload,
  Download,
  Plus,
  FolderPlus,
  Search,
  Grid,
  ListIcon,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Close,
  Check,
  More,
  Trash,
  Pencil,
  Move,
  Copy,
  Info,
  Settings,
  LogOut,
  Lock,
  User,
  Shield,
  Eye,
  EyeOff,
  Cloud,
  Refresh,
  ArrowLeft,
  ArrowUp,
  Home,
  Inbox,
};
