import React, { useEffect } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ACCRA: [number, number] = [5.6037, -0.187];

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function Fit({ office, current }: { office?: { lat: number; lng: number } | null; current?: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    if (office) pts.push([office.lat, office.lng]);
    if (current) pts.push([current.lat, current.lng]);
    if (pts.length === 2) map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 16 });
    else if (pts.length === 1) map.setView(pts[0], 16);
  }, [office?.lat, office?.lng, current?.lat, current?.lng, map]);
  return null;
}

function ClickCapture({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function OfficeLocationMap({
  office,
  current,
  radiusMeters,
  onPick,
  className = 'h-64 w-full overflow-hidden rounded-[var(--radius)] border border-[var(--border)]',
}: {
  office?: { lat: number; lng: number; name?: string } | null;
  current?: { lat: number; lng: number } | null;
  radiusMeters?: number;
  onPick?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const center: [number, number] = office ? [office.lat, office.lng] : current ? [current.lat, current.lng] : ACCRA;
  return (
    <div className={className}>
      <MapContainer center={center} zoom={15} className="h-full w-full" scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Fit office={office} current={current} />
        {onPick && <ClickCapture onPick={onPick} />}
        {office && (
          <>
            <Marker position={[office.lat, office.lng]} />
            {radiusMeters ? (
              <Circle
                center={[office.lat, office.lng]}
                radius={radiusMeters}
                pathOptions={{ color: 'var(--primary)', fillColor: 'var(--primary)', fillOpacity: 0.12, weight: 2 }}
              />
            ) : null}
          </>
        )}
        {current && (
          <CircleMarker
            center={[current.lat, current.lng]}
            radius={8}
            pathOptions={{ color: 'var(--accent-amber)', fillColor: 'var(--accent-amber)', fillOpacity: 0.9 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
