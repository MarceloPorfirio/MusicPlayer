import { useState, type FormEvent } from 'react';
import {
  api,
  formatBytes,
  songCount,
  type PlaylistSummary,
  type SmartKind,
  type SmartSummary,
} from '../api';
import { useOffline } from '../offline';
import { Cover } from './Cover';
import { HeartIcon, HistoryIcon, TrendingIcon } from './icons';

const SMART_ICONS = { favorites: HeartIcon, recent: HistoryIcon, top: TrendingIcon };

interface Props {
  playlists: PlaylistSummary[];
  smart: SmartSummary[];
  onOpen: (id: number) => void;
  onOpenSmart: (kind: SmartKind) => void;
  onChanged: () => void;
}

export function PlaylistsView({ playlists, smart, onOpen, onOpenSmart, onChanged }: Props) {
  const [name, setName] = useState('');
  const offline = useOffline();

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.createPlaylist(name);
    setName('');
    onChanged();
  }

  return (
    <>
      <form className="add-form" onSubmit={create}>
        <input
          placeholder="Nome da nova playlist…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn primary" disabled={!name.trim()}>
          Criar
        </button>
      </form>
      {offline.saved.size > 0 && (
        <div className="storage-card">
          <span>
            <strong>
              {offline.saved.size} música{offline.saved.size === 1 ? '' : 's'} no aparelho
            </strong>
            {offline.storage && (
              <span className="track-sub">
                App usando {formatBytes(offline.storage.usage)}
                {offline.storage.quota > 0 &&
                  ` de ${formatBytes(offline.storage.quota)} disponíveis`}
              </span>
            )}
          </span>
          <button
            className="btn danger"
            onClick={() => {
              if (
                confirm(
                  'Apagar todas as músicas baixadas no aparelho? Elas continuam na biblioteca.',
                )
              ) {
                void offline.clearAll();
              }
            }}
          >
            Liberar espaço
          </button>
        </div>
      )}
      <h3 className="section-title">Para você</h3>
      <ul className="smart-grid">
        {smart.map((s) => {
          const Icon = SMART_ICONS[s.kind];
          return (
            <li key={s.kind}>
              <button className={`smart-card ${s.kind}`} onClick={() => onOpenSmart(s.kind)}>
                <Icon width={28} height={28} />
                <span className="track-title">{s.name}</span>
                <span className="track-sub">{songCount(s.trackCount)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <h3 className="section-title">Suas playlists</h3>
      {!playlists.length && <p className="empty">Nenhuma playlist ainda.</p>}
      <ul className="playlist-grid">
        {playlists.map((p) => (
          <li key={p.id}>
            <button onClick={() => onOpen(p.id)}>
              <Cover trackId={p.coverTrackId} size={140} />
              <span className="track-title">{p.name}</span>
              <span className="track-sub">{songCount(p.trackCount)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
