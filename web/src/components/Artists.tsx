import { songCount, type Track } from '../api';
import { Cover } from './Cover';
import { ListActions } from './ListActions';
import { TrackList } from './TrackList';

const UNKNOWN = 'Artista desconhecido';

export interface Artist {
  /** Chave de agrupamento: "Linkin Park" e "LINKIN PARK" são o mesmo artista. */
  key: string;
  name: string;
  tracks: Track[];
  coverTrackId: number | null;
}

export const artistKey = (track: Track) =>
  (track.artist?.trim() || UNKNOWN).toLocaleLowerCase('pt-BR');

export function groupByArtist(tracks: Track[]): Artist[] {
  const groups = new Map<string, Artist>();
  for (const t of tracks) {
    const key = artistKey(t);
    let artist = groups.get(key);
    if (!artist) {
      artist = { key, name: t.artist?.trim() || UNKNOWN, tracks: [], coverTrackId: null };
      groups.set(key, artist);
    }
    artist.tracks.push(t);
    if (artist.coverTrackId === null && t.hasCover) artist.coverTrackId = t.id;
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function ArtistsGrid({
  artists,
  onOpen,
}: {
  artists: Artist[];
  onOpen: (key: string) => void;
}) {
  if (!artists.length) return <p className="empty">Nenhum artista encontrado.</p>;
  return (
    <ul className="artist-grid">
      {artists.map((a) => (
        <li key={a.key}>
          <button onClick={() => onOpen(a.key)}>
            <Cover trackId={a.coverTrackId} size={120} />
            <span className="track-title">{a.name}</span>
            <span className="track-sub">{songCount(a.tracks.length)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

interface ArtistViewProps {
  artist: Artist | undefined;
  onBack: () => void;
  onAddToPlaylist: (track: Track) => void;
  onEdited: () => void;
}

export function ArtistView({ artist, onBack, onAddToPlaylist, onEdited }: ArtistViewProps) {
  return (
    <>
      <div className="playlist-header">
        <button className="btn" onClick={onBack}>
          ← Voltar
        </button>
        {artist ? (
          <>
            <div className="artist-heading">
              <Cover trackId={artist.coverTrackId} size={72} />
              <div>
                <h2>{artist.name}</h2>
                <span className="track-sub">{songCount(artist.tracks.length)}</span>
              </div>
            </div>
            <ListActions tracks={artist.tracks} />
          </>
        ) : (
          <p className="empty">Este artista não tem mais músicas na biblioteca.</p>
        )}
      </div>
      {artist && (
        <TrackList tracks={artist.tracks} onAddToPlaylist={onAddToPlaylist} onEdited={onEdited} />
      )}
    </>
  );
}
