import { useState, type FormEvent } from 'react';
import { api, type Track } from '../api';

interface Props {
  track: Track;
  onClose: () => void;
  onSaved: (track: Track) => void;
}

export function EditTrackDialog({ track, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist ?? '');
  const [album, setAlbum] = useState(track.album ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
