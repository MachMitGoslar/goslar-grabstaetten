import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    defaultGraveFilters,
    GraveFilterModal,
    type GraveFilters,
} from '../components/GraveFilterModal.tsx';
import { GraveCard } from '../components/GraveCard.tsx';
import SearchBar from '../components/SearchBar.tsx';
import { cemeteryOptions, graves, normalizeDateValue } from '../data/graveData.ts';
import './GraveSearch.css';

export const GraveSearchPage = () => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [filters, setFilters] = useState<GraveFilters>(defaultGraveFilters);

    const filteredGraves = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const normalizedBirthDate = normalizeDateValue(filters.birthDate);
        const normalizedDeathDate = normalizeDateValue(filters.deathDate);

        return graves.filter((grave) => {
            const matchesQuery = !normalizedQuery || [
                filters.searchFirstName && grave.firstName,
                filters.searchLastName && grave.lastName,
                filters.searchBirthName && grave.birthName,
            ]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(normalizedQuery));

            const matchesBirthDate = !normalizedBirthDate ||
                normalizeDateValue(grave.birthDate).includes(normalizedBirthDate);
            const matchesDeathDate = !normalizedDeathDate ||
                normalizeDateValue(grave.deathDate).includes(normalizedDeathDate);
            const matchesCemetery = !filters.cemetery || grave.cemeteryName === filters.cemetery;

            return matchesQuery && matchesBirthDate && matchesDeathDate && matchesCemetery;
        });
    }, [filters, query]);

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
                {filteredGraves.length > 0 ? (
                    filteredGraves.map((grave) => (
                        <GraveCard
                            key={grave.id}
                            firstName={grave.firstName}
                            lastName={grave.displayLastName}
                            birthDate={grave.birthDate}
                            deathDate={grave.deathDate}
                            cemetery={grave.cemetery}
                            onClick={() => navigate(`/grabstellensuche/${grave.id}`)}
                        />
                    ))
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
