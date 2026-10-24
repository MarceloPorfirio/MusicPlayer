import { useState, type FormEvent } from 'react';
import { api, type PlaylistSummary, type Track } from '../api';

interface Props {
  track: Track;
  playlists: PlaylistSummary[];
  onClose: () => void;
  onChanged: () => void;
}

export function AddToPlaylistDialog({ track, playlists, onClose, onChanged }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function add(playlistId: number) {
    try {
      await api.addToPlaylist(playlistId, track.id);
      onChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createAndAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const playlist = await api.createPlaylist(name);
      await add(playlist.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <h2>Adicionar à playlist</h2>
        <p className="track-sub">{track.title}</p>
        <ul className="dialog-list">
          {playlists.map((p) => (
            <li key={p.id}>
              <button onClick={() => add(p.id)}>
                {p.name} <span className="track-sub">{p.trackCount} músicas</span>
              </button>
            </li>
          ))}
        </ul>
        <form className="add-form" onSubmit={createAndAdd}>
          <input placeholder="Nova playlist…" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" disabled={!name.trim()}>
            Criar
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
