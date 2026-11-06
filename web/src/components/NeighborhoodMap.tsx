import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { HoodCollection, HoodFeature } from '../model/siteData';
import { PALETTE } from './mapColours';

/** Street map tiles: OpenFreeMap, free and keyless, from OpenStreetMap data. */
export const TILE_HOST = 'https://tiles.openfreemap.org';
const STYLE = { light: `${TILE_HOST}/styles/positron`, dark: `${TILE_HOST}/styles/dark` };

type Props = {
  data: HoodCollection;
  /** Price-per-m² limits between the five colour bands. */
  bands: number[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  dark: boolean;
};

/** The box around a neighborhood, for placing its name tag. */
function centre(f: HoodFeature): [number, number] {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const poly of f.geometry.coordinates) {
    for (const [x, y] of poly[0]) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Tehran's official neighborhoods over a street map, coloured by their 2024 median price per m².
 * Hover shows a small card; a click selects a neighborhood that has enough ads.
 */
export default function NeighborhoodMap({ data, bands, selectedId, onSelect, dark }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  // Build the map, and build it again when the theme changes (the base style differs).
  useEffect(() => {
    if (!box.current) return;
    const colours = dark ? PALETTE.dark : PALETTE.light;
    const ramp = ['step', ['get', 'ppm2'], colours[0], bands[0], colours[1], bands[1], colours[2],
      bands[2], colours[3], bands[3], colours[4]] as unknown as ExpressionSpecification;
    const m = new maplibregl.Map({
      container: box.current,
      style: dark ? STYLE.dark : STYLE.light,
      bounds: [[51.2, 35.6], [51.6, 35.82]],
      fitBoundsOptions: { padding: 16 },
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'map-tip', offset: 12 });
    const label = document.createElement('div');
    label.className = 'map-tag';
    marker.current = new maplibregl.Marker({ element: label, anchor: 'bottom', offset: [0, -4] });
    let hovered: number | null = null;

    m.on('load', () => {
      const layers = m.getStyle().layers;
      for (const l of layers) {
        if (l.type !== 'symbol') continue;
        // English names only: a name with no English or Latin form is left out rather than shown unshaped.
        if (m.getLayoutProperty(l.id, 'text-field')) {
          m.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], '']);
        }
        if (dark) {
          m.setPaintProperty(l.id, 'text-color', '#D7DEDA');
          m.setPaintProperty(l.id, 'text-halo-color', '#1F2225');
        }
      }
      const firstSymbol = layers.find((l) => l.type === 'symbol')?.id;
      m.addSource('nb', { type: 'geojson', data: data as unknown as GeoJSON.FeatureCollection });
      m.addLayer({
        id: 'nb-fill', type: 'fill', source: 'nb', filter: ['has', 'ppm2'],
        paint: {
          'fill-color': ramp,
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.92, dark ? 0.75 : 0.65],
        },
      }, firstSymbol);
      m.addLayer({
        id: 'nb-line', type: 'line', source: 'nb',
        paint: { 'line-color': dark ? '#1F2225' : '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 14, 1.6] },
      }, firstSymbol);
      m.addLayer({
        id: 'nb-hover', type: 'line', source: 'nb',
        paint: {
          'line-color': dark ? '#F2F4F3' : '#101512', 'line-width': 1.6,
          'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
        },
      });
      m.addLayer({
        id: 'nb-sel', type: 'line', source: 'nb', filter: ['==', ['id'], selectedRef.current ?? -1],
        paint: { 'line-color': dark ? '#FFFFFF' : '#101512', 'line-width': 3 },
      });
      m.addLayer({
        id: 'nb-name', type: 'symbol', source: 'nb', minzoom: 12.6,
        layout: { 'text-field': ['get', 'name'], 'text-size': 11.5, 'text-font': ['Noto Sans Regular'], 'text-max-width': 7 },
        paint: { 'text-color': dark ? '#F2F4F3' : '#101512', 'text-halo-color': dark ? '#1F2225' : '#FFFFFF', 'text-halo-width': 1.4 },
      });
      const setHover = (id: number | null) => {
        if (hovered !== null) m.setFeatureState({ source: 'nb', id: hovered }, { hover: false });
        hovered = id;
        if (id !== null) m.setFeatureState({ source: 'nb', id }, { hover: true });
      };
      m.on('mousemove', 'nb-fill', (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f || typeof f.id !== 'number') return;
        m.getCanvas().style.cursor = 'pointer';
        setHover(f.id);
        const p = f.properties as { name: string; ppm2: number; ads: number };
        tip.setLngLat(e.lngLat)
          .setHTML(`<b>${escapeHtml(p.name)}</b><span>${p.ppm2} million per m²</span><small>${Number(p.ads).toLocaleString('en-US')} ads, 2024</small>`)
          .addTo(m);
      });
      m.on('mouseleave', 'nb-fill', () => {
        m.getCanvas().style.cursor = '';
        tip.remove();
        setHover(null);
      });
      m.on('click', 'nb-fill', (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.id;
        if (typeof id === 'number') onSelectRef.current(id);
      });
      (m.getSource('nb') as GeoJSONSource | undefined)?.setData(data as unknown as GeoJSON.FeatureCollection);
      box.current?.setAttribute('data-ready', 'true');
      showSelected(m);
    });
    return () => {
      marker.current?.remove();
      tip.remove();
      m.remove();
      map.current = null;
    };
    // The map is rebuilt only for a new theme or new data; selection is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, data, bands]);

  function showSelected(m: maplibregl.Map) {
    if (!m.getLayer('nb-sel')) return;
    const id = selectedRef.current;
    m.setFilter('nb-sel', ['==', ['id'], id ?? -1]);
    const f = data.features.find((x) => x.id === id);
    if (!f || !marker.current) {
      marker.current?.remove();
      return;
    }
    marker.current.getElement().textContent = f.properties.name;
    marker.current.setLngLat(centre(f)).addTo(m);
  }

  useEffect(() => {
    if (map.current) showSelected(map.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={box} className="hood-map" role="region" aria-label="Map of Tehran neighborhoods, coloured by price per square meter" />;
}
