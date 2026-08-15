'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ArrowLeft, LocateFixed, MapPin, CheckCircle, AlertCircle, Navigation } from 'lucide-react';
import { fieldApi } from '@/api';

const previewPinIcon = L.divIcon({
  html: `
    <div style="
      width: 42px;
      height: 42px;
      border-radius: 18px 18px 18px 5px;
      background: linear-gradient(135deg, #10b981, #0f766e 55%, #0f172a);
      box-shadow: 0 15px 30px rgba(4, 47, 46, 0.42);
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid rgba(255,255,255,0.8);
    ">
      <div style="
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: white;
        box-shadow: 0 0 0 5px rgba(255,255,255,0.25);
      "></div>
    </div>
  `,
  className: 'field-preview-pin',
  iconSize: [42, 42],
  iconAnchor: [21, 38],
});

function PreviewMapCenter({ coords }: { coords: { lat: number; lng: number } }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo([coords.lat, coords.lng], 16, { duration: 0.8 });
  }, [coords.lat, coords.lng, map]);

  return null;
}

const AddActivity: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [town, setTown] = useState('');
  const [coords, setCoords] = useState('');
  const [desc, setDesc] = useState('');
  const [gettingLocation, setGettingLocation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const parseCoordinates = (input: string): { lat: number; lng: number } | null => {
    if (!input.trim()) return null;
    const cleaned = input.replace(/[′′″]/g, "'").replace(/[″″]/g, '"').replace(/''/g, '"').replace(/\s+/g, ' ').trim();

    const dmsRegex = /(-?\d+(?:\.\d+)?)°\s*(\d+(?:\.\d+)?)'\s*(\d+(?:\.\d+)?)"?\s*([NS])\s*,?\s*(-?\d+(?:\.\d+)?)°\s*(\d+(?:\.\d+)?)'\s*(\d+(?:\.\d+)?)"?\s*([EW])/i;
    const match = cleaned.match(dmsRegex);
    if (match) {
      const [, d1, m1, s1, h1, d2, m2, s2, h2] = match;
      const lat = (parseFloat(d1) + parseFloat(m1) / 60 + parseFloat(s1) / 3600) * (h1.toUpperCase() === 'S' ? -1 : 1);
      const lng = (parseFloat(d2) + parseFloat(m2) / 60 + parseFloat(s2) / 3600) * (h2.toUpperCase() === 'W' ? -1 : 1);
      return { lat: Number(lat.toFixed(8)), lng: Number(lng.toFixed(8)) };
    }

    const decimalMatch = cleaned.match(/^\s*([+-]?\d*\.?\d+)\s*,?\s*([+-]?\d*\.?\d+)\s*$/);
    if (decimalMatch) {
      const lat = parseFloat(decimalMatch[1]);
      const lng = parseFloat(decimalMatch[2]);
      if (!isNaN(lat) && !isNaN(lng)) return { lat: Number(lat.toFixed(8)), lng: Number(lng.toFixed(8)) };
    }
    return null;
  };

  const parsedCoords = useMemo(() => parseCoordinates(coords), [coords]);

  const getLocation = () => {
    if (!navigator.geolocation) return showToast('GPS not supported', 'error');
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setCoords(`${lat}, ${lng}`);
        setAccuracy(pos.coords.accuracy || null);
        setGettingLocation(false);
        showToast(`GPS locked${pos.coords.accuracy ? ` within ${Math.round(pos.coords.accuracy)}m` : ''}`, 'success');
      },
      () => {
        showToast('Location access denied or GPS signal is weak', 'error');
        setGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      }
    );
  };

  const save = async () => {
    if (!name.trim()) return showToast('Enter project name', 'error');
    if (!town.trim()) return showToast('Enter town name', 'error');

    const parsed = parsedCoords;
    if (!parsed) return showToast('Invalid coordinates', 'error');

    setSaving(true);
    try {
      await fieldApi.create({
        projectName: name.trim(),
        town: town.trim(),
        description: desc.trim() || '',
        lat: parsed.lat,
        lng: parsed.lng,
      });

      showToast('Project saved successfully!', 'success');
      setTimeout(() => navigate('/field/activities'), 1500);
    } catch (err: any) {
      showToast(err.message || 'Failed to save project', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-white px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="mb-8 flex items-center gap-2 text-emerald-700 font-semibold hover:text-emerald-800 transition"
          >
            <ArrowLeft className="w-5 h-5" /> Back to Projects
          </button>

          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-8 py-10 text-white">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-4 rounded-2xl backdrop-blur">
                  <MapPin className="w-10 h-10" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold">Add New Project</h1>
                  <p className="text-emerald-100 mt-1">Pin your field location accurately</p>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-10 space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Project Name</label>
                <input
                  type="text"
                  placeholder="e.g. Kumasi Ring Road Phase 2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-5 py-4 border border-gray-300 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 text-lg transition"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Town / Area</label>
                <input
                  type="text"
                  placeholder="e.g. Kumasi, Techiman, Sunyani"
                  value={town}
                  onChange={(e) => setTown(e.target.value)}
                  className="w-full px-5 py-4 border border-gray-300 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 text-lg transition"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Coordinates</label>
                <div className="flex flex-col sm:flex-row gap-4">
                  <input
                    type="text"
                    placeholder="7°17'40&quot;N 2°42'03&quot;W or 6.6745, -1.5716"
                    value={coords}
                    onChange={(e) => {
                      setCoords(e.target.value);
                      setAccuracy(null);
                    }}
                    className="flex-1 px-5 py-4 border border-gray-300 rounded-2xl font-mono text-base focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 transition"
                  />
                  <button
                    onClick={getLocation}
                    disabled={gettingLocation}
                    className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition shadow-lg"
                  >
                    <LocateFixed className="w-6 h-6" />
                    {gettingLocation ? 'Locating...' : 'Use My GPS'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  <span>Supports DMS, fancy quotes, spaces, and commas.</span>
                  {accuracy && <span className="font-semibold text-emerald-700">GPS accuracy: ±{Math.round(accuracy)}m</span>}
                </p>
              </div>

              <div className="overflow-hidden rounded-[1.7rem] border border-emerald-100 bg-slate-950 shadow-2xl">
                <div className="flex items-center justify-between bg-gradient-to-r from-slate-950 via-emerald-950 to-teal-900 px-5 py-4 text-white">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-200/70">Location preview</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-50">
                      {parsedCoords ? `${parsedCoords.lat.toFixed(6)}, ${parsedCoords.lng.toFixed(6)}` : 'Enter or capture coordinates to preview the site'}
                    </p>
                  </div>
                  <Navigation className="h-5 w-5 text-emerald-200" />
                </div>

                <div className="relative h-72">
                  {parsedCoords ? (
                    <MapContainer
                      center={[parsedCoords.lat, parsedCoords.lng]}
                      zoom={16}
                      minZoom={5}
                      maxZoom={19}
                      zoomControl={false}
                      scrollWheelZoom={false}
                      dragging
                      className="h-full w-full"
                    >
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                        subdomains={['a', 'b', 'c', 'd']}
                        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                      />
                      <Marker position={[parsedCoords.lat, parsedCoords.lng]} icon={previewPinIcon} />
                      <PreviewMapCenter coords={parsedCoords} />
                    </MapContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#115e59,transparent_36%),linear-gradient(135deg,#020617,#064e3b)] p-8 text-center text-white">
                      <div>
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 backdrop-blur">
                          <MapPin className="h-8 w-8 text-emerald-200" />
                        </div>
                        <p className="text-lg font-black">Premium map preview</p>
                        <p className="mt-2 max-w-sm text-sm text-emerald-50/70">
                          Capture GPS for the strongest signal, then verify the exact pin before saving.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Description (Optional)</label>
                <textarea
                  placeholder="Add any notes about this site..."
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={4}
                  className="w-full px-5 py-4 border border-gray-300 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 resize-none transition"
                />
              </div>

              <button
                onClick={save}
                disabled={saving}
                className="w-full py-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-70 text-white font-bold text-xl rounded-2xl transition shadow-xl flex items-center justify-center gap-3"
              >
                <MapPin className="w-7 h-7" />
                {saving ? 'Saving...' : 'Save Project'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* TOAST — TOP CENTER, SMALL & SMOOTH */}
      {toast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 duration-500">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white font-semibold text-sm ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}>
            {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {toast.message}
          </div>
        </div>
      )}
    </>
  );
};

export default AddActivity;