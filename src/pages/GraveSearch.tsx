import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraveCard } from '../components/GraveCard.tsx';
import { GraveFilterModal } from '../components/GraveFilterModal.tsx';
import { defaultGraveFilters, type GraveFilters } from '../components/graveFilterState.ts';
import SearchBar from '../components/SearchBar.tsx';
import { fetchGravesPage, type GraveRecord, type GraveSearchParams } from '../data/graveData.ts';
import cemeteries from '../data/cemeteries.json';
import './GraveSearch.css';

const pageSize = 80;
const cemeteryOptions = (cemeteries as Array<{ name: string }>)
    .map((cemetery) => cemetery.name)
    .sort((left, right) => left.localeCompare(right, 'de'));

export const GraveSearchPage = () => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebouncedValue(query, 250);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [filters, setFilters] = useState<GraveFilters>(defaultGraveFilters);
    const [graves, setGraves] = useState<GraveRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [nextOffset, setNextOffset] = useState<number | null>(null);
    const [totalGraves, setTotalGraves] = useState<number | null>(null);
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
                                onClick={() => navigate(`/grabstellensuche/${grave.id}`)}
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
