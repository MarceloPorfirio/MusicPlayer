import { useEffect, useState, type FormEvent } from 'react';
import { api, type PlaylistSummary, type Track } from '../api';
import { PlusIcon } from './icons';

interface Props {
  track: Track;
  onClose: () => void;
  onSaved: (track: Track) => void;
}

export function EditTrackDialog({ track, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist ?? '');
  const [album, setAlbum] = useState(track.album ?? '');

  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [original, setOriginal] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [newPlaylist, setNewPlaylist] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.playlists(), api.trackPlaylists(track.id)])
      .then(([all, mine]) => {
        setPlaylists(all);
        setOriginal(new Set(mine));
        setSelected(new Set(mine));
      })
      .catch((err) => setError((err as Error).message));
  }, [track.id]);

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateTrack(track.id, {
        title: title.trim(),
        artist: artist.trim() || null,
        album: album.trim() || null,
      });

      const toAdd = [...selected].filter((id) => !original.has(id));
      const toRemove = [...original].filter((id) => !selected.has(id));
      if (newPlaylist?.trim()) {
        toAdd.push((await api.createPlaylist(newPlaylist.trim())).id);
      }
      await Promise.all([
        ...toAdd.map((id) => api.addToPlaylist(id, track.id)),
        ...toRemove.map((id) => api.removeFromPlaylist(id, track.id)),
      ]);

      onSaved(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
      >
        <h2>Editar música</h2>
        <label className="field">
          <span>Título</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Artista</span>
          <input value={artist} onChange={(e) => setArtist(e.target.value)} />
        </label>
        <label className="field">
          <span>Álbum</span>
          <input value={album} onChange={(e) => setAlbum(e.target.value)} />
        </label>

        <div className="field">
          <span>Playlists</span>
          {playlists === null ? (
            <p className="track-sub">Carregando…</p>
          ) : (
            <ul className="check-list">
              {playlists.map((p) => (
                <li key={p.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    <span>{p.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {newPlaylist === null ? (
            <button type="button" className="btn add-playlist" onClick={() => setNewPlaylist('')}>
              <PlusIcon width={18} height={18} /> Nova playlist
            </button>
          ) : (
            <input
              placeholder="Nome da nova playlist"
              value={newPlaylist}
              onChange={(e) => setNewPlaylist(e.target.value)}
              autoFocus
            />
          )}
        </div>

        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || !title.trim()}>
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
