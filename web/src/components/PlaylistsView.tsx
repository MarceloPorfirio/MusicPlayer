import { useState, type FormEvent } from 'react';
import { api, type PlaylistSummary } from '../api';
import { Cover } from './Cover';

interface Props {
  playlists: PlaylistSummary[];
  onOpen: (id: number) => void;
  onChanged: () => void;
}

export function PlaylistsView({ playlists, onOpen, onChanged }: Props) {
  const [name, setName] = useState('');

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
        <input placeholder="Nome da nova playlist…" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={!name.trim()}>
          Criar
        </button>
      </form>
      {!playlists.length && <p className="empty">Nenhuma playlist ainda.</p>}
      <ul className="playlist-grid">
        {playlists.map((p) => (
          <li key={p.id}>
            <button onClick={() => onOpen(p.id)}>
              <Cover trackId={p.coverTrackId} size={140} />
              <span className="track-title">{p.name}</span>
              <span className="track-sub">{p.trackCount} músicas</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
