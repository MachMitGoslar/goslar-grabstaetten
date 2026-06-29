import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraveCard } from '../components/GraveCard.tsx';
import { GraveFilterModal } from '../components/GraveFilterModal.tsx';
import { defaultGraveFilters, type GraveFilters } from '../components/graveFilterState.ts';
import SearchBar from '../components/SearchBar.tsx';
import { fetchGravesPage, type GraveRecord, type GraveSearchParams } from '../data/graveData.ts';
import cemeteries from '../data/cemeteries.json';
import './GraveSearch.css';

const pageSize = 80;
const searchStateStorageKey = 'grave-search-state-v2';
const cemeteryOptions = (cemeteries as Array<{ name: string }>)
    .map((cemetery) => cemetery.name)
    .sort((left, right) => left.localeCompare(right, 'de'));

export const GraveSearchPage = () => {
    const navigate = useNavigate();
    const restoredState = useMemo(() => readStoredSearchState(), []);
    const shouldSkipInitialFetchRef = useRef(Boolean(restoredState));
    const shouldRestoreScrollRef = useRef(Boolean(restoredState));
    const latestScrollYRef = useRef(restoredState?.scrollY ?? 0);
    const [query, setQuery] = useState(restoredState?.query ?? '');
    const debouncedQuery = useDebouncedValue(query, 250);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [filters, setFilters] = useState<GraveFilters>(restoredState?.filters ?? defaultGraveFilters);
    const [graves, setGraves] = useState<GraveRecord[]>(restoredState?.graves ?? []);
    const [isLoading, setIsLoading] = useState(!restoredState);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [nextOffset, setNextOffset] = useState<number | null>(restoredState?.nextOffset ?? null);
    const [totalGraves, setTotalGraves] = useState<number | null>(restoredState?.totalGraves ?? null);
    const [error, setError] = useState('');

    const searchParams = useMemo<GraveSearchParams>(() => ({
        birthDate: filters.birthDate,
        cemetery: filters.cemetery,
        deathDate: filters.deathDate,
        query: debouncedQuery.trim(),
        searchBirthName: filters.searchBirthName,
        searchFirstName: filters.searchFirstName,
        searchLastName: filters.searchLastName,
    }), [debouncedQuery, filters]);

    useEffect(() => {
        if (shouldSkipInitialFetchRef.current) {
            shouldSkipInitialFetchRef.current = false;
            return undefined;
        }

        const abortController = new AbortController();

        const loadFirstPage = async () => {
            setIsLoading(true);
            setError('');

            try {
                const page = await fetchGravesPage(0, pageSize, searchParams, abortController.signal);

                setGraves(page.items);
                setNextOffset(page.nextOffset);
                setTotalGraves(page.total);
            } catch (loadError) {
                if (loadError instanceof DOMException && loadError.name === 'AbortError') {
                    return;
                }

                setGraves([]);
                setNextOffset(null);
                setTotalGraves(null);
                setError('Grabstellen konnten nicht aus der Datenbank geladen werden.');
            } finally {
                if (!abortController.signal.aborted) {
                    setIsLoading(false);
                }
            }
        };

        void loadFirstPage();

        return () => {
            abortController.abort();
        };
    }, [searchParams]);

    useEffect(() => {
        if (shouldRestoreScrollRef.current) {
            return;
        }

        writeStoredSearchState({
            filters,
            graves,
            nextOffset,
            query,
            scrollY: latestScrollYRef.current,
            totalGraves,
        });
    }, [filters, graves, nextOffset, query, totalGraves]);

    useEffect(() => {
        if (!restoredState || !shouldRestoreScrollRef.current || isLoading) {
            return;
        }

        shouldRestoreScrollRef.current = false;
        restoreWindowScroll(restoredState.scrollY);
    }, [isLoading, restoredState]);

    useEffect(() => () => {
        writeStoredSearchState({
            filters,
            graves,
            nextOffset,
            query,
            scrollY: latestScrollYRef.current,
            totalGraves,
        });
    }, [filters, graves, nextOffset, query, totalGraves]);

    useEffect(() => {
        const updateScrollPosition = () => {
            latestScrollYRef.current = window.scrollY;
        };

        updateScrollPosition();
        window.addEventListener('scroll', updateScrollPosition, { passive: true });

        return () => {
            window.removeEventListener('scroll', updateScrollPosition);
        };
    }, []);

    const loadMoreGraves = useCallback(async () => {
        if (nextOffset === null || isLoadingMore) {
            return;
        }

        setIsLoadingMore(true);
        setError('');

        try {
            const page = await fetchGravesPage(nextOffset, pageSize, searchParams);

            setGraves((currentGraves) => [...currentGraves, ...page.items]);
            setNextOffset(page.nextOffset);
            setTotalGraves(page.total);
        } catch {
            setError('Weitere Grabstellen konnten nicht geladen werden.');
        } finally {
            setIsLoadingMore(false);
        }
    }, [isLoadingMore, nextOffset, searchParams]);

    return (
        <main className="grave-search-page">
            <button
                type="button"
                className="grave-search-back"
                aria-label="Zurück"
                onClick={() => navigate('/')}
            >
                <BackIcon />
            </button>

            <section className="grave-search-hero">
                <h1 className="grave-search-title">Grabstellensuche</h1>

                <p className="grave-search-subtitle">
                    Nutze unsere Grabstellensuche. Gebe deinen Suchbegriff ein und
                    starte die Suche. Zusätzlich kannst du die Ergebnisse filtern.
                </p>
            </section>

            <section className="grave-search-controls">
                <SearchBar
                    value={query}
                    onChange={setQuery}
                    onFilterClick={() => setIsFilterOpen(true)}
                />
            </section>

            <section className="grave-search-list" aria-label="Suchergebnisse">
                {error && graves.length === 0 ? (
                    <p className="grave-search-empty">{error}</p>
                ) : isLoading ? (
                    <GraveSearchLoader />
                ) : graves.length > 0 ? (
                    <>
                        {graves.map((grave) => (
                            <GraveCard
                                key={grave.id}
                                firstName={grave.firstName}
                                lastName={grave.displayLastName}
                                birthDate={grave.birthDate}
                                deathDate={grave.deathDate}
                                cemetery={grave.cemetery}
                                onClick={() => {
                                    const scrollY = window.scrollY;
                                    latestScrollYRef.current = scrollY;
                                    writeStoredSearchState({
                                        filters,
                                        graves,
                                        nextOffset,
                                        query,
                                        scrollY,
                                        totalGraves,
                                    });
                                    navigate(`/grabstellensuche/${grave.id}`);
                                }}
                            />
                        ))}

                        {error && <p className="grave-search-empty">{error}</p>}

                        {nextOffset !== null && (
                            <button
                                type="button"
                                className="grave-search-load-more"
                                onClick={loadMoreGraves}
                                disabled={isLoadingMore}
                            >
                                {isLoadingMore ? <GraveSearchSpinner /> : 'Weitere laden'}
                            </button>
                        )}

                        <p className="grave-search-count">
                            {graves.length.toLocaleString('de-DE')}
                            {totalGraves !== null && ` von ${totalGraves.toLocaleString('de-DE')}`} angezeigt
                        </p>
                    </>
                ) : (
                    <p className="grave-search-empty">Keine Grabstellen gefunden.</p>
                )}
            </section>

            {isFilterOpen && (
                <GraveFilterModal
                    filters={filters}
                    cemeteryOptions={cemeteryOptions}
                    onChange={setFilters}
                    onClose={() => setIsFilterOpen(false)}
                    onReset={() => setFilters(defaultGraveFilters)}
                />
            )}
        </main>
    );
};

type StoredSearchState = {
    filters: GraveFilters;
    graves: GraveRecord[];
    nextOffset: number | null;
    query: string;
    scrollY: number;
    totalGraves: number | null;
};

const readStoredSearchState = (): StoredSearchState | null => {
    try {
        const serializedState = window.sessionStorage.getItem(searchStateStorageKey);

        if (!serializedState) {
            return null;
        }

        const state = JSON.parse(serializedState) as Partial<StoredSearchState>;

        if (!state.filters || !Array.isArray(state.graves)) {
            return null;
        }

        if (state.graves.length === 0 && (state.totalGraves ?? 0) === 0) {
            return null;
        }

        return {
            filters: {
                ...defaultGraveFilters,
                ...state.filters,
            },
            graves: state.graves,
            nextOffset: state.nextOffset ?? null,
            query: state.query ?? '',
            scrollY: state.scrollY ?? 0,
            totalGraves: state.totalGraves ?? null,
        };
    } catch {
        return null;
    }
};

const writeStoredSearchState = (state: StoredSearchState) => {
    window.sessionStorage.setItem(searchStateStorageKey, JSON.stringify(state));
};

const restoreWindowScroll = (scrollY: number) => {
    const restore = () => window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });

    restore();
    window.requestAnimationFrame(() => {
        restore();
        window.requestAnimationFrame(restore);
    });
    window.setTimeout(restore, 50);
    window.setTimeout(restore, 150);
};

const useDebouncedValue = <Value,>(value: Value, delay: number) => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timeout = window.setTimeout(() => setDebouncedValue(value), delay);

        return () => window.clearTimeout(timeout);
    }, [delay, value]);

    return debouncedValue;
};

const BackIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path
            d="M19 12H5M12 5l-7 7 7 7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.8"
        />
    </svg>
);

const GraveSearchLoader = () => (
    <div className="grave-search-loader" role="status" aria-live="polite">
        <GraveSearchSpinner />
    </div>
);

const GraveSearchSpinner = () => (
    <span className="grave-search-spinner" aria-hidden="true" />
);
