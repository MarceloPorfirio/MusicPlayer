import { LibraryIcon, PlaylistIcon, SearchIcon } from './icons';

export type Tab = 'search' | 'library' | 'playlists';

const TABS = [
  { id: 'search', label: 'Buscar', Icon: SearchIcon },
  { id: 'library', label: 'Biblioteca', Icon: LibraryIcon },
  { id: 'playlists', label: 'Playlists', Icon: PlaylistIcon },
] as const;

interface Props {
  tab: Tab;
  searchBadge: boolean;
  onSelect: (tab: Tab) => void;
}

/** Abas fixas embaixo, no alcance do polegar. */
export function BottomNav({ tab, searchBadge, onSelect }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Seções">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={tab === id ? 'active' : undefined}
          aria-current={tab === id ? 'page' : undefined}
          onClick={() => onSelect(id)}
        >
          <span className="nav-icon">
            <Icon />
            {id === 'search' && searchBadge && (
              <span className="badge" aria-label="downloads em andamento" />
            )}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
