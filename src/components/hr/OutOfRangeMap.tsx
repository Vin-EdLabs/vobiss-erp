import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface OutOfRangeMapProps {
  userLat: number;
  userLng: number;
  officeLat: number;
  officeLng: number;
  officeRadius: number;
  officeName: string;
  distanceMeters: number;
  onRetry: () => void;
  onDismiss: () => void;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function walkingTime(meters: number): string {
  const minutes = Math.ceil(meters / 80);
  if (minutes < 60) return `~${minutes} min walk`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `~${hours}h ${rem}m walk`;
}

function drivingTime(meters: number): string {
  const minutes = Math.ceil(meters / 500);
  if (minutes < 1) return '<1 min drive';
  if (minutes < 60) return `~${minutes} min drive`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `~${hours}h ${rem}m drive`;
}

function escapeHtml(value: string) {
  return String(value || '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch
  ));
}

export type OutOfRangeInfo = {
  userLat: number;
  userLng: number;
  officeLat: number;
  officeLng: number;
  officeRadius: number;
  officeName: string;
  distanceMeters: number;
};

export function parseOutOfRangeError(
  error: any,
  extras?: {
    coords?: { latitude: number; longitude: number } | null;
    office?: {
      office_latitude?: unknown;
      office_longitude?: unknown;
      office_name?: string;
      office_radius_meters?: unknown;
    } | null;
  }
): OutOfRangeInfo | null {
  if (!error) return null;
  const distance = Number(error.distance);
  if (!Number.isFinite(distance)) return null;
  const officeLat = Number(error.office_lat ?? error.office?.latitude ?? extras?.office?.office_latitude);
  const officeLng = Number(error.office_lng ?? error.office?.longitude ?? extras?.office?.office_longitude);
  const userLat = Number(extras?.coords?.latitude ?? error.current?.latitude);
  const userLng = Number(extras?.coords?.longitude ?? error.current?.longitude);
  if (![officeLat, officeLng, userLat, userLng].every(Number.isFinite)) return null;
  return {
    userLat,
    userLng,
    officeLat,
    officeLng,
    officeRadius: Number(error.required ?? extras?.office?.office_radius_meters) || 100,
    officeName: error.office_name || error.office?.name || extras?.office?.office_name || 'Office',
    distanceMeters: distance,
  };
}

export function OutOfRangeMap({
  userLat,
  userLng,
  officeLat,
  officeLng,
  officeRadius,
  officeName,
  distanceMeters,
  onRetry,
  onDismiss,
}: OutOfRangeMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    let cancelled = false;
    let t1 = 0;
    let t2 = 0;
    let observer: ResizeObserver | null = null;

    const destroy = () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      observer?.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (el && (el as any)._leaflet_id) delete (el as any)._leaflet_id;
    };

    const initMap = () => {
      if (cancelled || !mapRef.current) return;
      destroy();
      if (cancelled || !mapRef.current) return;

    const centerLat = (userLat + officeLat) / 2;
    const centerLng = (userLng + officeLng) / 2;
    const map = L.map(mapRef.current, {
      center: [centerLat, centerLng],
      zoom: 15,
      zoomControl: true,
      scrollWheelZoom: false,
    });
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const officeIcon = L.divIcon({
      html: `
        <div style="
          width: 40px; height: 40px;
          background: #059669;
          border: 3px solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(5,150,105,0.4);
          font-size: 18px;
        ">🏢</div>
        <div style="
          position: absolute;
          bottom: -24px;
          left: 50%;
          transform: translateX(-50%);
          background: #059669;
          color: white;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 10px;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        ">Office</div>
      `,
      className: 'oor-div-icon',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    const userIcon = L.divIcon({
      html: `
        <div style="
          width: 40px; height: 40px;
          background: #DC2626;
          border: 3px solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(220,38,38,0.4);
          font-size: 18px;
        ">📍</div>
        <div style="
          position: absolute;
          bottom: -24px;
          left: 50%;
          transform: translateX(-50%);
          background: #DC2626;
          color: white;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 10px;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        ">You</div>
      `,
      className: 'oor-div-icon',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    L.marker([officeLat, officeLng], { icon: officeIcon })
      .addTo(map)
      .bindPopup(`
        <div style="text-align:center; padding: 4px 8px;">
          <strong>${escapeHtml(officeName)}</strong><br/>
          <span style="color:#059669; font-size:12px">Office Location</span>
        </div>
      `);

    const userMarker = L.marker([userLat, userLng], { icon: userIcon })
      .addTo(map)
      .bindPopup(`
        <div style="text-align:center; padding: 4px 8px;">
          <strong>Your Location</strong><br/>
          <span style="color:#DC2626; font-size:12px">
            ${formatDistance(distanceMeters)} from office
          </span>
        </div>
      `);

    L.circle([officeLat, officeLng], {
      radius: officeRadius,
      color: '#059669',
      fillColor: '#059669',
      fillOpacity: 0.08,
      weight: 2,
      dashArray: '6, 4',
    }).addTo(map);

    L.polyline(
      [[userLat, userLng], [officeLat, officeLng]],
      { color: '#DC2626', weight: 2, dashArray: '8, 6', opacity: 0.7 }
    ).addTo(map);

    const midLat = (userLat + officeLat) / 2;
    const midLng = (userLng + officeLng) / 2;
    const distanceLabel = L.divIcon({
      html: `
        <div style="
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 20px;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 600;
          color: #DC2626;
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
          white-space: nowrap;
        ">
          📏 ${formatDistance(distanceMeters)}
        </div>
      `,
      className: 'oor-div-icon',
      iconAnchor: [40, 12],
    });
    L.marker([midLat, midLng], { icon: distanceLabel, interactive: false }).addTo(map);

    const bounds = L.latLngBounds([userLat, userLng], [officeLat, officeLng]);
    const refresh = () => {
      if (cancelled) return;
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [60, 60] });
      userMarker.openPopup();
    };
    requestAnimationFrame(refresh);
    t1 = window.setTimeout(refresh, 120);
    t2 = window.setTimeout(refresh, 400);
    };

    const tryInit = () => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return false;
      if (mapRef.current.clientWidth > 0 && mapRef.current.clientHeight > 0) {
        initMap();
        return true;
      }
      return false;
    };

    if (!tryInit()) {
      observer = new ResizeObserver(() => {
        if (tryInit()) observer?.disconnect();
      });
      observer.observe(el);
      t1 = window.setTimeout(() => { tryInit(); }, 80);
    }

    return () => {
      cancelled = true;
      destroy();
    };
  }, [userLat, userLng, officeLat, officeLng, officeRadius, officeName, distanceMeters]);

  const distance = formatDistance(distanceMeters);
  const walking = walkingTime(distanceMeters);
  const driving = drivingTime(distanceMeters);
  const rangePct = Math.min((officeRadius / Math.max(distanceMeters, 1)) * 100, 100);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Outside office zone"
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(0, 0, 0, 0.45)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '92vh',
          overflow: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
      <style>{`
        .oor-div-icon {
          background: none !important;
          border: none !important;
        }
      `}</style>

      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            background: 'var(--danger-light)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            flexShrink: 0,
          }}
        >
          📍
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            You're outside the office zone
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Clock-in requires you to be within {officeRadius}m of {officeName}
          </div>
        </div>
      </div>

      <div ref={mapRef} style={{ height: '280px', width: '100%' }} />

      <div
        style={{
          padding: '16px 20px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '12px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            background: 'var(--danger-light)',
            borderRadius: 'var(--radius)',
            padding: '12px',
            textAlign: 'center',
            borderLeft: '3px solid var(--accent-red)',
          }}
        >
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-red)' }}>{distance}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>from office</div>
        </div>
        <div
          style={{
            background: 'var(--warning-light)',
            borderRadius: 'var(--radius)',
            padding: '12px',
            textAlign: 'center',
            borderLeft: '3px solid var(--accent-amber)',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-amber)' }}>🚶 {walking}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>walking</div>
        </div>
        <div
          style={{
            background: 'var(--accent-blue-light)',
            borderRadius: 'var(--radius)',
            padding: '12px',
            textAlign: 'center',
            borderLeft: '3px solid var(--accent-blue)',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-blue)' }}>🚗 {driving}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>driving</div>
        </div>
      </div>

      <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            flex: 1,
            height: '6px',
            background: 'var(--border)',
            borderRadius: '10px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${rangePct}%`,
              background: '#059669',
              borderRadius: '10px',
            }}
          />
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          Need to be within {officeRadius}m
        </span>
      </div>

      <div style={{ padding: '12px 20px 20px', display: 'flex', gap: '10px' }}>
        <button
          type="button"
          onClick={onRetry}
          style={{
            flex: 1,
            padding: '10px',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🔄 Try Again
        </button>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            flex: 1,
            padding: '10px',
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      </div>
      </div>
    </div>,
    document.body
  );
}
