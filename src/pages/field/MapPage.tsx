'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Search, Navigation, MapPin, ArrowLeft, LocateFixed, RefreshCcw, Wifi, WifiOff, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fieldApi, FieldActivity } from '@/api';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const GHANA_CENTER: [number, number] = [7.9465, -1.0232];
type LatLngPoint = { lat: number; lng: number };
type MapStyle = 'satellite' | 'streets';

const premiumPinIcon = L.divIcon({
  html: `
    <div class="vobiss-map-pin">
      <div class="vobiss-map-pin__ring"></div>
      <div class="vobiss-map-pin__core">
        <svg xmlns="http://www.w3.org/2000/svg" width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    </div>
  `,
  className: 'vobiss-map-pin-wrap',
  iconSize: [58, 58],
  iconAnchor: [29, 54],
  popupAnchor: [0, -50],
});

const FlyToAndOpenPopup: React.FC<{ target: FieldActivity | null }> = ({ target }) => {
  const map = useMap();

  useEffect(() => {
    if (!target) return;

    const latLng = L.latLng(target.lat, target.lng);
    map.flyTo(latLng, 16, { duration: 1.8 });

    const timer = setTimeout(() => {
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker && layer.getLatLng().equals(latLng)) {
          (layer as L.Marker).openPopup();
        }
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [target, map]);

  return null;
};

const FitProjectConnection: React.FC<{
  from: LatLngPoint | null;
  to: FieldActivity | null;
}> = ({ from, to }) => {
  const map = useMap();

  useEffect(() => {
    if (!from || !to) return;

    const bounds = L.latLngBounds(
      [from.lat, from.lng],
      [to.lat, to.lng]
    ).pad(0.28);
    map.flyToBounds(bounds, { duration: 1.2, maxZoom: 14 });
  }, [from, to, map]);

  return null;
};

const MapConnectionEvents: React.FC<{
  onReady: () => void;
  onTileError: () => void;
}> = ({ onReady, onTileError }) => {
  useMapEvents({
    load: onReady,
    tileerror: onTileError,
  });
  return null;
};

const LocateControl: React.FC<{ onError: (message: string) => void }> = ({ onError }) => {
  const map = useMap();

  const locate = () => {
    map.locate({
      setView: true,
      maxZoom: 16,
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
    });
  };

  useMapEvents({
    locationfound: (event) => {
      L.circle(event.latlng, {
        radius: Math.min(event.accuracy || 80, 450),
        color: '#14b8a6',
        fillColor: '#14b8a6',
        fillOpacity: 0.14,
        weight: 2,
      }).addTo(map);
    },
    locationerror: () => onError('Could not lock your current GPS location. Check browser location permission.'),
  });

  return (
    <button
      type="button"
      onClick={locate}
      className="absolute bottom-28 right-4 z-[1000] flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 bg-white/95 text-emerald-700 shadow-2xl backdrop-blur transition hover:-translate-y-0.5 hover:bg-white sm:bottom-8 sm:right-8"
      title="Find my location"
    >
      <LocateFixed className="h-5 w-5" />
    </button>
  );
};

const MapPage: React.FC = () => {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<FieldActivity[]>([]);
  const [initialActivities, setInitialActivities] = useState<FieldActivity[]>([]);
  const [displayedActivities, setDisplayedActivities] = useState<FieldActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActivity, setSelectedActivity] = useState<FieldActivity | null>(null);
  const [showDropdown, setShowDropdown] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [tileErrors, setTileErrors] = useState(0);
  const [mapStyle, setMapStyle] = useState<MapStyle>('satellite');
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [currentLocation, setCurrentLocation] = useState<LatLngPoint | null>(null);
  const [locatingRoute, setLocatingRoute] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fieldApi.getAll();
      setActivities(data);

      const latestPins = [...data]
        .filter((act) => Number.isFinite(act.lat) && Number.isFinite(act.lng))
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
        .slice(0, 40);

      setInitialActivities(latestPins);
      setDisplayedActivities(latestPins);
    } catch (err) {
      showToast('Failed to load projects. Check the connection and try again.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      showToast('Connection restored. Map is live again.', 'success');
    };
    const handleOffline = () => {
      setOnline(false);
      showToast('You are offline. Map tiles may pause until connection returns.', 'error');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  // Filtered results
  const filteredActivities = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return activities.filter(
      (act) =>
        act.projectName?.toLowerCase().includes(query) ||
        (act.town && act.town.toLowerCase().includes(query)) ||
        `${act.lat}, ${act.lng}`.includes(query)
    );
  }, [activities, searchQuery]);

  useEffect(() => {
    if (searchQuery.trim()) {
      setDisplayedActivities(filteredActivities);
    } else {
      setDisplayedActivities(initialActivities);
    }
  }, [searchQuery, filteredActivities, initialActivities]);

  const connectFromCurrentLocation = useCallback((activity: FieldActivity) => {
    if (!navigator.geolocation) {
      showToast('GPS is not supported on this device.', 'error');
      return;
    }

    setLocatingRoute(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocatingRoute(false);
        showToast(`Connected from your location to ${activity.projectName}`);
      },
      () => {
        setLocatingRoute(false);
        showToast('Allow location permission to draw the connection from you to the project.', 'error');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 18000,
      }
    );
  }, [showToast]);

  const selectActivity = (activity: FieldActivity) => {
    setSelectedActivity(activity);
    setSearchQuery(activity.projectName);
    setShowDropdown(false);
    connectFromCurrentLocation(activity);
  };

  const shouldShowDropdown = showDropdown && searchQuery.trim() && filteredActivities.length > 0;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowDropdown(true);
    if (!value.trim()) {
      setSelectedActivity(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && filteredActivities.length > 0) {
      selectActivity(filteredActivities[0]);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center overflow-hidden bg-[#061a16]">
        <div className="relative overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-white/10 p-8 text-center text-white shadow-2xl backdrop-blur-2xl">
          <div className="mx-auto mb-5 h-16 w-16 animate-pulse rounded-3xl bg-gradient-to-br from-emerald-300 to-cyan-300 shadow-lg shadow-emerald-900/50" />
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-100/70">Vobiss Maps</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Loading premium map</h1>
          <p className="mt-2 text-sm text-emerald-50/70">Connecting to project locations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-hidden bg-[#061a16] text-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[900] h-40 bg-gradient-to-b from-[#031310] via-[#031310]/75 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[900] h-28 bg-gradient-to-t from-[#031310]/85 to-transparent" />

      <button
        onClick={() => navigate('/field/activities')}
        className="absolute left-3 top-3 z-[1001] flex items-center gap-2 rounded-xl border border-white/15 bg-white/95 px-3 py-2 text-sm font-bold text-emerald-800 shadow-xl backdrop-blur transition hover:-translate-y-0.5 hover:bg-white"
      >
        <ArrowLeft className="h-5 w-5" />
        <span className="hidden sm:inline">Back to List</span>
      </button>

      <div className="absolute left-3 right-3 top-14 z-[1000] sm:left-5 sm:right-5 sm:top-4">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 text-white sm:pl-36">
            <div className="hidden rounded-2xl border border-white/15 bg-white/10 p-2.5 shadow-xl backdrop-blur-xl sm:block">
              <MapPin className="h-6 w-6 text-emerald-200" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-emerald-100/70">Field map</p>
              <h1 className="mt-0.5 truncate text-xl font-black tracking-tight sm:text-3xl">Projects Map</h1>
              <p className="mt-0.5 truncate text-xs font-medium text-emerald-50/80 sm:text-sm">
                {activities.length} project locations synced across Ghana
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <div className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold shadow-xl backdrop-blur-xl ${
              online ? 'border-emerald-300/25 bg-emerald-400/15 text-emerald-50' : 'border-red-300/30 bg-red-500/20 text-red-50'
            }`}>
              {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {online ? 'Live connection' : 'Offline'}
            </div>
            <div className="hidden items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-xl backdrop-blur-xl sm:inline-flex">
              <MapPin className="h-3.5 w-3.5 text-emerald-200" />
              {displayedActivities.length} pins shown
            </div>
            <button
              type="button"
              onClick={() => setMapStyle((s) => (s === 'satellite' ? 'streets' : 'satellite'))}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/95 px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 shadow-xl backdrop-blur transition hover:bg-white"
              title={mapStyle === 'satellite' ? 'Switch to street map' : 'Switch to satellite'}
            >
              <Layers className="h-3.5 w-3.5" />
              {mapStyle === 'satellite' ? 'Satellite' : 'Streets'}
            </button>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/95 px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 shadow-xl backdrop-blur transition hover:bg-white"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="absolute left-1/2 top-32 z-[1000] w-full max-w-xl -translate-x-1/2 px-3 sm:top-24 sm:px-4">
        <div className="relative">
          <div className="overflow-hidden rounded-2xl border border-white/30 bg-white/95 shadow-[0_18px_55px_rgba(0,0,0,0.26)] backdrop-blur-2xl">
            <div className="flex items-center">
              <Search className="ml-3 h-5 w-5 text-emerald-600 sm:ml-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Search project, town, or coordinates..."
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none sm:px-4 sm:py-3.5 sm:text-base"
                autoFocus
              />
              <div className="bg-gradient-to-br from-emerald-600 to-teal-600 px-3 py-3 text-sm font-black text-white sm:px-5 sm:py-3.5 sm:text-base">
                {searchQuery.trim() ? filteredActivities.length : displayedActivities.length}
              </div>
            </div>
          </div>

          {shouldShowDropdown && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-white/40 bg-white/95 shadow-2xl backdrop-blur-xl">
              {filteredActivities.map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => selectActivity(act)}
                  className="flex w-full items-start justify-between border-b border-slate-100 p-3 text-left transition last:border-b-0 hover:bg-emerald-50"
                >
                  <div>
                    <h4 className="text-sm font-black text-emerald-900">{act.projectName}</h4>
                    {act.town && <p className="mt-0.5 text-xs font-bold text-emerald-600">{act.town}</p>}
                    <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                      {act.lat.toFixed(6)}, {act.lng.toFixed(6)}
                    </p>
                  </div>
                  <Navigation className="mt-1 h-4 w-4 text-emerald-600" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <MapContainer center={GHANA_CENTER} zoom={7} minZoom={5} maxZoom={19} className={`h-full w-full vobiss-premium-map ${mapStyle === 'satellite' ? 'vobiss-map-satellite' : ''}`} zoomControl={false}>
        {mapStyle === 'satellite' ? (
          <>
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxNativeZoom={19}
              attribution="Tiles &copy; Esri"
              eventHandlers={{
                tileerror: () => setTileErrors((count) => count + 1),
              }}
            />
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxNativeZoom={19}
              attribution=""
            />
          </>
        ) : (
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains={['a', 'b', 'c', 'd']}
            maxNativeZoom={20}
            attribution="&copy; OpenStreetMap contributors &copy; CARTO"
            eventHandlers={{
              tileerror: () => setTileErrors((count) => count + 1),
            }}
          />
        )}
        {tileErrors > 3 && (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
            opacity={0.35}
          />
        )}
        <MapConnectionEvents onReady={() => setTileErrors(0)} onTileError={() => setTileErrors((count) => count + 1)} />
        <LocateControl onError={(message) => showToast(message, 'error')} />
        {currentLocation && selectedActivity && (
          <>
            <Polyline
              positions={[
                [currentLocation.lat, currentLocation.lng],
                [selectedActivity.lat, selectedActivity.lng],
              ]}
              pathOptions={{
                color: '#0f766e',
                weight: 8,
                opacity: 0.22,
                lineCap: 'round',
              }}
            />
            <Polyline
              positions={[
                [currentLocation.lat, currentLocation.lng],
                [selectedActivity.lat, selectedActivity.lng],
              ]}
              pathOptions={{
                color: '#22d3ee',
                weight: 3,
                opacity: 0.95,
                dashArray: '10 12',
                lineCap: 'round',
              }}
            />
            <CircleMarker
              center={[currentLocation.lat, currentLocation.lng]}
              radius={9}
              pathOptions={{
                color: '#ffffff',
                fillColor: '#0ea5e9',
                fillOpacity: 1,
                weight: 3,
              }}
            />
            <FitProjectConnection from={currentLocation} to={selectedActivity} />
          </>
        )}

        {displayedActivities.map((act) => (
          <Marker key={act.id} position={[act.lat, act.lng]} icon={premiumPinIcon}>
            <Popup className="vobiss-map-popup" closeButton={false}>
              <div className="max-w-[17rem] overflow-hidden rounded-2xl bg-white text-slate-900">
                <div className="bg-gradient-to-br from-emerald-700 via-teal-700 to-slate-900 p-4 text-white">
                  <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-emerald-100/75">Project site</p>
                  <h3 className="mt-1.5 text-base font-black leading-tight">{act.projectName}</h3>
                </div>
                <div className="space-y-3 p-4">
                {act.town && (
                  <div>
                    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-800">
                      {act.town}
                    </span>
                  </div>
                )}
                <div className="rounded-xl bg-slate-100 px-3 py-2 font-mono text-[11px] font-bold text-slate-700">
                  <span>{act.lat.toFixed(6)}, {act.lng.toFixed(6)}</span>
                </div>
                {act.description && (
                  <p className="line-clamp-3 text-xs font-medium leading-relaxed text-slate-700">
                    {act.description}
                  </p>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${act.lat},${act.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-900/20 transition hover:from-emerald-700 hover:to-teal-700"
                >
                  <Navigation className="h-4 w-4" />
                  Navigate
                </a>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {!currentLocation && <FlyToAndOpenPopup target={selectedActivity} />}
      </MapContainer>

      <div className="absolute bottom-3 left-3 z-[1000] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/20 bg-[#061a16]/80 px-3 py-2.5 text-white shadow-2xl backdrop-blur-2xl sm:bottom-5 sm:left-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-100/60">Map status</p>
        <p className="mt-0.5 text-xs font-semibold">
          {locatingRoute
            ? 'Getting your current location...'
            : currentLocation && selectedActivity
              ? `Connected to ${selectedActivity.projectName}`
              : tileErrors > 3
                ? 'Backup map layer active.'
                : 'Search a project to connect from your location.'}
        </p>
      </div>

      {toast && (
        <div className="fixed left-1/2 top-6 z-[1200] -translate-x-1/2 animate-in slide-in-from-top-4 duration-300">
          <div className={`rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-2xl ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}>
            {toast.message}
          </div>
        </div>
      )}

      <style>{`
        .vobiss-premium-map {
          background: #071b17;
        }

        .vobiss-premium-map .leaflet-control-attribution {
          border-radius: 999px 0 0 0;
          background: rgba(255, 255, 255, 0.78);
          font-weight: 700;
        }

        .vobiss-premium-map .leaflet-tile {
          filter: saturate(1.08) contrast(1.02);
        }

        .vobiss-map-satellite .leaflet-tile {
          filter: saturate(1.12) contrast(1.08) brightness(1.02);
        }

        .vobiss-map-pin-wrap {
          background: transparent;
          border: 0;
        }

        .vobiss-map-pin {
          position: relative;
          width: 58px;
          height: 58px;
        }

        .vobiss-map-pin__ring {
          position: absolute;
          inset: 5px;
          border-radius: 999px;
          background: rgba(20, 184, 166, 0.28);
          animation: pulse 2s infinite;
        }

        .vobiss-map-pin__core {
          position: absolute;
          inset: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 22px 22px 22px 6px;
          background: linear-gradient(135deg, #10b981, #0f766e 54%, #0f172a);
          box-shadow: 0 18px 35px rgba(4, 47, 46, 0.5), inset 0 1px 0 rgba(255,255,255,0.35);
          transform: rotate(-45deg);
        }

        .vobiss-map-pin__core svg {
          transform: rotate(45deg);
        }

        .vobiss-map-popup .leaflet-popup-content-wrapper,
        .vobiss-map-popup .leaflet-popup-content {
          margin: 0;
          padding: 0;
          border-radius: 1.5rem;
          overflow: hidden;
        }

        .vobiss-map-popup .leaflet-popup-content-wrapper {
          box-shadow: 0 24px 70px rgba(2, 6, 23, 0.35);
        }

        .vobiss-map-popup .leaflet-popup-tip {
          background: white;
        }

        @keyframes pulse {
          0% { transform: scale(0.85); opacity: 0.85; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55); }
          70% { transform: scale(1.35); opacity: 0; box-shadow: 0 0 0 22px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.85); opacity: 0; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
      `}</style>
    </div>
  );
};

export default MapPage;