import { coverUrl } from '../api';
import { MusicIcon } from './icons';

export function Cover({ trackId, size = 48 }: { trackId: number | null; size?: number }) {
  return (
    <div className="cover" style={{ width: size, height: size }}>
      {trackId !== null ? (
        <img src={coverUrl(trackId)} alt="" loading="lazy" />
      ) : (
        <MusicIcon width={size / 2} height={size / 2} />
      )}
    </div>
  );
}
