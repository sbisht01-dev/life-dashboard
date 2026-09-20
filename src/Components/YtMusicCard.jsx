import React, { useState, useEffect } from 'react';
import './YtMusicCard.jsx';

// TODO: Replace with your actual Last.fm details
const LASTFM_USER = "sbisht";
const LASTFM_API_KEY = ""; 
const POLL_INTERVAL = 15000; // Check every 15 seconds

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
  const [loading, setLoading] = useState(true); // Starts true on initial page load

  useEffect(() => {
    const fetchNowPlaying = async () => {
      try {
        const res = await fetch(
          `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${LASTFM_USER}&api_key=${LASTFM_API_KEY}&format=json&limit=1`
        );
        const data = await res.json();

        if (data.recenttracks && data.recenttracks.track.length > 0) {
          const latest = data.recenttracks.track[0];
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
            isPlaying: latest['@attr']?.nowplaying === 'true'
          });
        }
      } catch (err) {
        console.error("Failed to fetch music data", err);
      } finally {
        setLoading(false); // Shuts off the skeleton loaders
      }
    };

    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const isInitialLoad = loading && !track;

  return (
    <div className="bento-card col-4 music-bento" style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
      
      {/* Background artwork glow */}
      {track?.albumArt && !isInitialLoad && (
        <div 
          className="music-bg-blur" 
          style={{ backgroundImage: `url(${track.albumArt})` }}
        />
      )}

      {/* Standard Card Header */}
      <div className="card-header" style={{ marginBottom: '16px', position: 'relative', zIndex: 1 }}>
        <span className="card-title mono">
          {isInitialLoad ? (
            <div className="skeleton" style={{ width: '90px', height: '12px', borderRadius: '4px', display: 'inline-block' }}></div>
          ) : track?.isPlaying ? (
            "Now Playing"
          ) : (
            "Recently Played"
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

      {/* HARDCODED FLEXBOX ROW */}
      <div className="music-body" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: 'auto', position: 'relative', zIndex: 1 }}>
        
        <div className="album-art-wrap" style={{ flexShrink: 0, width: '64px', height: '64px' }}>
          {isInitialLoad ? (
            /* Skeleton Artwork Block */
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
            /* Skeleton Text Bars */
            <>
              <div className="skeleton" style={{ width: '80%', height: '16px', borderRadius: '4px' }}></div>
              <div className="skeleton" style={{ width: '50%', height: '14px', borderRadius: '4px', marginTop: '2px' }}></div>
            </>
          ) : (
            <>
              <div className="track-title mono" title={track?.name} style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {track?.name || "No track active"}
              </div>
              <div className="track-artist-line mono" title={track?.artist} style={{ fontSize: '13px', fontWeight: '500', color: 'var(--accent-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {track?.artist || "YouTube Music"}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}