import React, { useState, useEffect } from 'react';
import './YtMusicCard.css';

const LASTFM_USER = import.meta.env.VITE_LASTFM_USER; 
const LASTFM_API_KEY = import.meta.env.VITE_LASTFM_API_KEY; 
const POLL_INTERVAL = 15000;

const fetchFallbackArtwork = async (artist, trackName) => {
  try {
    const cleanTitle = trackName.replace(/\(.*?\)|\[.*?\]/g, '').replace(/ft\..*|feat\..*/i, '').trim();
    const query = encodeURIComponent(`${artist} ${cleanTitle}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`);
    const data = await res.json();

    if (data.resultCount > 0 && data.results[0].artworkUrl100) {
      return data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
    }
  } catch (err) {
    console.warn("iTunes artwork fallback failed:", err);
  }
  return '';
};

export default function YtMusicCard() {
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNowPlaying = async () => {
      if (!LASTFM_USER || !LASTFM_API_KEY) {
        console.error("Missing Last.fm environment variables!");
        setLoading(false);
        return;
      }

      try {
        // Added &t=${Date.now()} to bust the cache so it updates instantly
        const res = await fetch(
          `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${LASTFM_USER}&api_key=${LASTFM_API_KEY}&format=json&limit=1&t=${Date.now()}`
        );
        const data = await res.json();

        if (data.recenttracks && data.recenttracks.track.length > 0) {
          const latest = data.recenttracks.track[0];
          const isPlaying = latest['@attr']?.nowplaying === 'true';

          // STRICT LIVE MODE: If music is stopped, clear the track out completely
          if (!isPlaying) {
            setTrack({ isPlaying: false, name: null, artist: null, albumArt: null });
            return;
          }

          const artist = latest.artist?.['#text'] || '';
          const name = latest.name || '';
          
          let artUrl = latest.image?.find(img => img.size === 'extralarge' || img.size === 'large')?.['#text'] || '';

          if (!artUrl && artist && name) {
            artUrl = await fetchFallbackArtwork(artist, name);
          }

          setTrack({
            name,
            artist,
            albumArt: artUrl,
            isPlaying
          });
        }
      } catch (err) {
        console.error("Failed to fetch music data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const isInitialLoad = loading && !track;
  const showTrack = track?.isPlaying && track?.name;

  return (
    <div className="bento-card col-4 music-bento" style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
      
      {track?.albumArt && (
        <div 
          className="music-bg-blur" 
          style={{ backgroundImage: `url(${track.albumArt})` }}
        />
      )}

      <div className="card-header" style={{ marginBottom: '16px', position: 'relative', zIndex: 1 }}>
        <span className="card-title mono">
          {isInitialLoad ? (
            <div className="skeleton" style={{ width: '90px', height: '12px', borderRadius: '4px', display: 'inline-block' }}></div>
          ) : track?.isPlaying ? (
            "Now Playing"
          ) : (
            "Media Offline"
          )}
        </span>
        
        {isInitialLoad ? null : track?.isPlaying ? (
          <div className="equalizer">
            <div className="eq-bar"></div>
            <div className="eq-bar"></div>
            <div className="eq-bar"></div>
            <div className="eq-bar"></div>
          </div>
        ) : (
          <span className="music-idle-tag mono">Idle</span>
        )}
      </div>

      <div className="music-body" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: 'auto', position: 'relative', zIndex: 1 }}>
        
        <div className="album-art-wrap" style={{ flexShrink: 0, width: '64px', height: '64px' }}>
          {isInitialLoad ? (
            <div className="skeleton" style={{ width: '64px', height: '64px', borderRadius: '12px' }}></div>
          ) : track?.albumArt ? (
            <img 
              src={track.albumArt} 
              alt={track.name} 
              style={{ width: '64px', height: '64px', minWidth: '64px', objectFit: 'cover', borderRadius: '12px', display: 'block', boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }} 
            />
          ) : (
            <div style={{ width: '64px', height: '64px', borderRadius: '12px', background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
          )}
        </div>

        <div className="track-text-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, flex: 1 }}>
          {isInitialLoad ? (
            <>
              <div className="skeleton" style={{ width: '80%', height: '16px', borderRadius: '4px' }}></div>
              <div className="skeleton" style={{ width: '50%', height: '14px', borderRadius: '4px', marginTop: '2px' }}></div>
            </>
          ) : (
            <>
              <div className="track-title mono" title={showTrack ? track.name : ''} style={{ fontSize: '15px', fontWeight: '700', color: showTrack ? 'var(--text-main)' : 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {showTrack ? track.name : "No active playback"}
              </div>
              <div className="track-artist-line mono" title={showTrack ? track.artist : ''} style={{ fontSize: '13px', fontWeight: '500', color: showTrack ? 'var(--accent-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {showTrack ? track.artist : "Awaiting stream..."}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}