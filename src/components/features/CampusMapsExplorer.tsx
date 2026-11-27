import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Building2,
  Compass,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Route as RouteIcon,
  Search,
  Star,
} from 'lucide-react';
import type { Branch } from '../../types/lms';
import { INSTITUTE_INFO } from '../../data/catalogSeed';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// Default Sri Lanka map viewport centered over Western Province (used only as initial map camera)
const SRI_LANKA_DEFAULT_CENTER = { lat: 6.9271, lng: 79.8612 };

type TravelMode = 'DRIVING' | 'TRANSIT' | 'WALKING';

interface LivePlaceResult {
  id: string;
  displayName: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  rating?: number | null;
  userRatingCount?: number | null;
  googleMapsURI?: string | null;
  branchCode?: string;
  isCampusSearch?: boolean;
}

interface RouteSummary {
  distanceMeters: number;
  durationMillis: number;
  originLabel: string;
  destinationLabel: string;
  travelMode: TravelMode;
}

function isQuotaError(err: unknown): boolean {
  const text =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null
        ? JSON.stringify(err)
        : String(err || '');
  return /OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|QuotaExceededError|OverQuotaMapError|\b429\b/i.test(
    text
  );
}

function notifyQuotaExceededIfNeeded(err: unknown): void {
  if (isQuotaError(err)) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

interface PlaceMarkerProps {
  place: LivePlaceResult;
  isSelected: boolean;
  onSelect: (place: LivePlaceResult) => void;
  onClose: () => void;
}

const PlaceMarkerWithInfo: React.FC<PlaceMarkerProps> = ({
  place,
  isSelected,
  onSelect,
  onClose,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={place.location}
        title={place.displayName}
        onClick={() => onSelect(place)}
      >
        <Pin
          background={place.isCampusSearch ? '#1677FF' : '#0EA5E9'}
          borderColor={place.isCampusSearch ? '#0A192F' : '#0369A1'}
          glyphColor="#FFFFFF"
          scale={isSelected ? 1.25 : 1.0}
        />
      </AdvancedMarker>
      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={290} onCloseClick={onClose}>
          <div className="p-1 text-slate-900 space-y-1.5">
            {place.branchCode && (
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                {place.branchCode}
              </div>
            )}
            <div className="font-bold text-sm leading-snug">{place.displayName}</div>
            {place.formattedAddress && (
              <div className="text-xs text-slate-600 leading-relaxed">{place.formattedAddress}</div>
            )}
            {typeof place.rating === 'number' && (
              <div className="flex items-center gap-1 text-xs text-amber-600 font-semibold">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                <span>{place.rating.toFixed(1)}</span>
                {typeof place.userRatingCount === 'number' && (
                  <span className="text-slate-500 font-normal">
                    ({place.userRatingCount.toLocaleString()} reviews)
                  </span>
                )}
              </div>
            )}
            {place.googleMapsURI && (
              <a
                href={place.googleMapsURI}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 pt-1"
              >
                Open in Google Maps
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface InteractiveMapCanvasProps {
  physicalBranches: Branch[];
  activeBranchId: string;
  places: LivePlaceResult[];
  selectedPlace: LivePlaceResult | null;
  onSelectPlace: (p: LivePlaceResult | null) => void;
  onPlacesResolved: (results: LivePlaceResult[], focusFirst: boolean) => void;
  searchQueryTrigger: { query: string; branchCode?: string; isCampus?: boolean; seq: number } | null;
  routeRequest: {
    origin: string | { lat: number; lng: number };
    originLabel: string;
    destination: { lat: number; lng: number };
    destinationLabel: string;
    travelMode: TravelMode;
    seq: number;
  } | null;
  onRouteSummary: (summary: RouteSummary | null) => void;
  onStatusChange: (status: { loading: boolean; error: string | null }) => void;
}

interface MapsPolylineLike {
  setOptions: (opts: { strokeColor?: string; strokeWeight?: number; strokeOpacity?: number }) => void;
  setMap: (map: unknown) => void;
}

const InteractiveMapCanvas: React.FC<InteractiveMapCanvasProps> = ({
  places,
  selectedPlace,
  onSelectPlace,
  onPlacesResolved,
  searchQueryTrigger,
  routeRequest,
  onRouteSummary,
  onStatusChange,
}) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<MapsPolylineLike[]>([]);

  // Live Places API (New) Text Search via useMapsLibrary('places')
  useEffect(() => {
    if (!placesLib || !searchQueryTrigger || !searchQueryTrigger.query.trim()) return;
    let cancelled = false;

    const runPlaceSearch = async () => {
      onStatusChange({ loading: true, error: null });
      try {
        // Places API (New): Place.searchByText — never uses legacy PlacesService
        const PlaceClass = (placesLib as unknown as {
          Place: {
            searchByText: (req: {
              textQuery: string;
              fields: string[];
              region?: string;
              language?: string;
              maxResultCount?: number;
            }) => Promise<{
              places?: Array<{
                id?: string;
                displayName?: string;
                formattedAddress?: string;
                location?: { lat: () => number; lng: () => number } | { lat: number; lng: number };
                rating?: number | null;
                userRatingCount?: number | null;
                googleMapsURI?: string | null;
              }>;
            }>;
          };
        }).Place;

        const { places: rawPlaces } = await PlaceClass.searchByText({
          textQuery: searchQueryTrigger.query,
          fields: [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'rating',
            'userRatingCount',
            'googleMapsURI',
          ],
          region: 'LK',
          language: 'en',
          maxResultCount: 6,
        });

        if (cancelled) return;

        const mapped: LivePlaceResult[] = (rawPlaces || [])
          .map((p, idx) => {
            const loc = p.location;
            if (!loc) return null;
            const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
            const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return {
              id: p.id || `place_${idx}_${lat.toFixed(4)}`,
              displayName: p.displayName || searchQueryTrigger.query,
              formattedAddress: p.formattedAddress || '',
              location: { lat, lng },
              rating: p.rating ?? null,
              userRatingCount: p.userRatingCount ?? null,
              googleMapsURI: p.googleMapsURI ?? null,
              branchCode: idx === 0 ? searchQueryTrigger.branchCode : undefined,
              isCampusSearch: searchQueryTrigger.isCampus && idx === 0,
            } as LivePlaceResult;
          })
          .filter((item): item is LivePlaceResult => item !== null);

        onPlacesResolved(mapped, true);
        if (mapped.length > 0 && map) {
          map.panTo(mapped[0].location);
          map.setZoom(mapped.length === 1 ? 14 : 13);
          onStatusChange({ loading: false, error: null });
        } else {
          onStatusChange({
            loading: false,
            error: 'No matching places were found on Google Maps for that search query.',
          });
        }
      } catch (err) {
        if (cancelled) return;
        notifyQuotaExceededIfNeeded(err);
        onStatusChange({
          loading: false,
          error:
            err instanceof Error
              ? err.message
              : 'Unable to load Google Maps Places search results.',
        });
      }
    };

    void runPlaceSearch();
    return () => {
      cancelled = true;
    };
  }, [placesLib, map, searchQueryTrigger, onPlacesResolved, onStatusChange]);

  // Modern Routes API via useMapsLibrary('routes') -> Route.computeRoutes()
  useEffect(() => {
    if (!routesLib || !map || !routeRequest) return;

    // Clear previous polylines before computing a fresh route
    polylinesRef.current.forEach((line) => line.setMap(null));
    polylinesRef.current = [];
    onRouteSummary(null);

    let cancelled = false;
    onStatusChange({ loading: true, error: null });

    const RouteClass = (routesLib as unknown as {
      Route: {
        computeRoutes: (req: {
          origin: string | { lat: number; lng: number };
          destination: { lat: number; lng: number };
          travelMode: TravelMode;
          fields: string[];
        }) => Promise<{
          routes?: Array<{
            distanceMeters?: number;
            durationMillis?: number;
            viewport?: unknown;
            createPolylines: () => MapsPolylineLike[];
          }>;
        }>;
      };
    }).Route;

    RouteClass.computeRoutes({
      origin: routeRequest.origin,
      destination: routeRequest.destination,
      travelMode: routeRequest.travelMode,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
    })
      .then((result) => {
        if (cancelled) return;
        const primaryRoute = result?.routes?.[0];
        if (!primaryRoute) {
          onStatusChange({
            loading: false,
            error: 'No route could be computed between those locations for the selected travel mode.',
          });
          return;
        }

        const newPolylines = primaryRoute.createPolylines();
        newPolylines.forEach((polyline) => {
          polyline.setOptions({
            strokeColor: '#1677FF',
            strokeWeight: 5,
            strokeOpacity: 0.9,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = newPolylines;

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport);
        }

        onRouteSummary({
          distanceMeters: primaryRoute.distanceMeters ?? 0,
          durationMillis: primaryRoute.durationMillis ?? 0,
          originLabel: routeRequest.originLabel,
          destinationLabel: routeRequest.destinationLabel,
          travelMode: routeRequest.travelMode,
        });
        onStatusChange({ loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        notifyQuotaExceededIfNeeded(err);
        onStatusChange({
          loading: false,
          error:
            err instanceof Error
              ? err.message
              : 'Unable to calculate route via Google Maps Routes API.',
        });
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((line) => line.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, routeRequest, onRouteSummary, onStatusChange]);

  return (
    <GoogleMap
      defaultCenter={SRI_LANKA_DEFAULT_CENTER}
      defaultZoom={10}
      mapId="DEMO_MAP_ID"
      gestureHandling="greedy"
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      style={{ width: '100%', height: '100%' }}
    >
      {places.map((place) => (
        <PlaceMarkerWithInfo
          key={place.id}
          place={place}
          isSelected={selectedPlace?.id === place.id}
          onSelect={(p) => onSelectPlace(p)}
          onClose={() => onSelectPlace(null)}
        />
      ))}
    </GoogleMap>
  );
};

interface CampusMapsExplorerProps {
  branches: Branch[];
  compact?: boolean;
}

export const CampusMapsExplorer: React.FC<CampusMapsExplorerProps> = ({ branches, compact }) => {
  const physicalBranches = branches.filter(
    (b) => !/online|global/i.test(b.name) && !/online|global/i.test(b.city)
  );
  const [activeBranchId, setActiveBranchId] = useState<string>(
    physicalBranches[0]?.id || 'branch-colombo-hq'
  );
  const [searchInput, setSearchInput] = useState('');
  const [originInput, setOriginInput] = useState('Colombo Fort Railway Station, Sri Lanka');
  const [travelMode, setTravelMode] = useState<TravelMode>('DRIVING');
  const [places, setPlaces] = useState<LivePlaceResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<LivePlaceResult | null>(null);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [status, setStatus] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });

  const [searchTrigger, setSearchTrigger] = useState<{
    query: string;
    branchCode?: string;
    isCampus?: boolean;
    seq: number;
  } | null>(() => {
    const first = physicalBranches[0];
    return {
      query: first ? `${first.city}, Sri Lanka` : 'Colombo, Sri Lanka',
      branchCode: first?.code || 'CMB-HQ',
      isCampus: true,
      seq: 1,
    };
  });

  const [routeRequest, setRouteRequest] = useState<{
    origin: string | { lat: number; lng: number };
    originLabel: string;
    destination: { lat: number; lng: number };
    destinationLabel: string;
    travelMode: TravelMode;
    seq: number;
  } | null>(null);

  const activeBranch =
    physicalBranches.find((b) => b.id === activeBranchId) || physicalBranches[0] || branches[0];

  const handleLocateBranch = (branch: Branch) => {
    setActiveBranchId(branch.id);
    setRouteSummary(null);
    setRouteRequest(null);
    setSearchTrigger((prev) => ({
      query: `${branch.city}, Sri Lanka`,
      branchCode: branch.code,
      isCampus: true,
      seq: (prev?.seq || 0) + 1,
    }));
  };

  const handleSearchNearby = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    setRouteSummary(null);
    setRouteRequest(null);
    setSearchTrigger((prev) => ({
      query: `${searchInput.trim()} near ${activeBranch?.city || 'Colombo'}, Sri Lanka`,
      isCampus: false,
      seq: (prev?.seq || 0) + 1,
    }));
  };

  const handleCalculateRoute = (useMyLocation = false) => {
    const target = selectedPlace || places[0];
    if (!target) {
      setStatus({
        loading: false,
        error: 'Select a campus or place marker on the map first before computing directions.',
      });
      return;
    }

    if (useMyLocation && navigator.geolocation) {
      setStatus({ loading: true, error: null });
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setRouteRequest((prev) => ({
            origin: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            originLabel: 'Your Current Location',
            destination: target.location,
            destinationLabel: target.displayName,
            travelMode,
            seq: (prev?.seq || 0) + 1,
          }));
        },
        () => {
          setStatus({
            loading: false,
            error:
              'Location permission was denied. Enter a starting point in Sri Lanka to calculate directions.',
          });
        },
        { timeout: 8000 }
      );
      return;
    }

    if (!originInput.trim()) {
      setStatus({ loading: false, error: 'Enter a starting address or landmark for directions.' });
      return;
    }

    setRouteRequest((prev) => ({
      origin: originInput.trim(),
      originLabel: originInput.trim(),
      destination: target.location,
      destinationLabel: target.displayName,
      travelMode,
      seq: (prev?.seq || 0) + 1,
    }));
  };

  const handlePlacesResolved = useCallback((results: LivePlaceResult[], focusFirst: boolean) => {
    setPlaces(results);
    if (focusFirst && results.length > 0) {
      setSelectedPlace(results[0]);
    }
  }, []);

  const handleStatusChange = useCallback(
    (next: { loading: boolean; error: string | null }) => {
      setStatus(next);
    },
    []
  );

  return (
    <div className="rounded-3xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1677FF] dark:text-sky-400">
            Interactive Campus Locator · Google Maps Platform
          </p>
          <h2 className="mt-1 text-xl sm:text-2xl font-extrabold text-[#101D35] dark:text-white">
            Explore Sri Lanka Campuses, Nearby Places &amp; Directions
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {physicalBranches.map((branch) => {
            const active = branch.id === activeBranch?.id;
            return (
              <button
                key={branch.id}
                type="button"
                onClick={() => handleLocateBranch(branch)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  active
                    ? 'bg-[#1677FF] text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                {branch.city}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left Control & Live Results Rail */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 p-5 space-y-5 bg-slate-50/70 dark:bg-[#0D182C]">
          {/* Active Branch Official Info */}
          {activeBranch && (
            <div className="rounded-2xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-[#1677FF] dark:text-sky-400">
                <span>{activeBranch.code}</span>
                <span>{activeBranch.city}</span>
              </div>
              <div className="font-bold text-sm text-[#101D35] dark:text-white">
                {activeBranch.name}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{activeBranch.address}</span>
              </p>
              <p className="text-xs font-mono text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{activeBranch.phone || INSTITUTE_INFO.phone}</span>
              </p>
            </div>
          )}

          {/* Live Places API (New) Search */}
          <form onSubmit={handleSearchNearby} className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Search Places Near {activeBranch?.city || 'Campus'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Bus stand, library, cafe, station..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1677FF]"
              />
              <button
                type="submit"
                disabled={status.loading}
                className="px-3.5 py-2 rounded-xl bg-[#101D35] dark:bg-[#1677FF] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer flex items-center gap-1"
              >
                <Search className="w-3.5 h-3.5" />
                Find
              </button>
            </div>
          </form>

          {/* Live Routes API Directions */}
          <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <RouteIcon className="w-3.5 h-3.5 text-[#1677FF]" />
                Route Planner (Routes API)
              </span>
              <div className="flex gap-1">
                {(['DRIVING', 'TRANSIT', 'WALKING'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTravelMode(m)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      travelMode === m
                        ? 'bg-[#1677FF] text-white'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {m === 'DRIVING' ? 'Drive' : m === 'TRANSIT' ? 'Transit' : 'Walk'}
                  </button>
                ))}
              </div>
            </div>

            <input
              type="text"
              value={originInput}
              onChange={(e) => setOriginInput(e.target.value)}
              placeholder="Starting address or station in Sri Lanka"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1677FF]"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleCalculateRoute(false)}
                disabled={status.loading}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#1677FF] hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                <Navigation className="w-3.5 h-3.5" />
                Get Directions
              </button>
              <button
                type="button"
                onClick={() => handleCalculateRoute(true)}
                disabled={status.loading}
                title="Use my GPS location"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5 text-[#1677FF]" />
                GPS
              </button>
            </div>

            {routeSummary && (
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-3 text-xs space-y-1">
                <div className="font-bold text-blue-900 dark:text-blue-200">
                  {(routeSummary.distanceMeters / 1000).toFixed(1)} km ·{' '}
                  {Math.max(1, Math.round(routeSummary.durationMillis / 60000))} mins (
                  {routeSummary.travelMode.toLowerCase()})
                </div>
                <div className="text-[11px] text-blue-800/80 dark:text-blue-300/90">
                  {routeSummary.originLabel} → {routeSummary.destinationLabel}
                </div>
              </div>
            )}
          </div>

          {/* Live Status / Place Results List */}
          {status.loading && (
            <div className="flex items-center gap-2 text-xs text-[#1677FF] font-semibold">
              <Loader2 className="w-4 h-4 animate-spin" />
              Querying live Google Maps Platform data…
            </div>
          )}
          {status.error && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3 text-xs text-rose-700 dark:text-rose-300">
              {status.error}
            </div>
          )}

          {places.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Live Google Maps Results ({places.length})
              </div>
              {places.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlace(p)}
                  className={`w-full text-left p-2.5 rounded-xl border text-xs transition cursor-pointer ${
                    selectedPlace?.id === p.id
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-[#1677FF] text-[#101D35] dark:text-white'
                      : 'bg-white dark:bg-[#101D35] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold truncate">{p.displayName}</div>
                  {p.formattedAddress && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {p.formattedAddress}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Interactive Google Map Container (CF2: explicit CSS height) */}
        <div className={`lg:col-span-8 relative w-full ${compact ? 'h-[400px]' : 'h-[480px] lg:h-[540px]'}`}>
          {MAPS_API_KEY ? (
            <APIProvider
              apiKey={MAPS_API_KEY}
              libraries={['marker', 'places', 'routes']}
              language="en"
              region="LK"
            >
              <InteractiveMapCanvas
                physicalBranches={physicalBranches}
                activeBranchId={activeBranch?.id || ''}
                places={places}
                selectedPlace={selectedPlace}
                onSelectPlace={setSelectedPlace}
                onPlacesResolved={handlePlacesResolved}
                searchQueryTrigger={searchTrigger}
                routeRequest={routeRequest}
                onRouteSummary={setRouteSummary}
                onStatusChange={handleStatusChange}
              />
            </APIProvider>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-slate-100 dark:bg-slate-900">
              <MapPin className="w-10 h-10 text-[#1677FF] mb-3" />
              <div className="text-sm font-bold text-[#101D35] dark:text-white">
                Google Maps API Key Pending Environment Reload
              </div>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 max-w-md">
                Configure <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> in your
                environment secrets and reload to display the live interactive campus map.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
