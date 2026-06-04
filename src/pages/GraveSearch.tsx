import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    defaultGraveFilters,
    GraveFilterModal,
    type GraveFilters,
} from '../components/GraveFilterModal.tsx';
import { GraveCard } from '../components/GraveCard.tsx';
import SearchBar from '../components/SearchBar.tsx';
import graveCsv from '../assets/data/data.CSV?raw';
import './GraveSearch.css';

type GraveRecord = {
    id: string;
    cemeteryCode: string;
    graveNumber: string;
    displayLastName: string;
    lastName: string;
    firstName: string;
    birthName: string;
    birthDate: string;
    deathDate: string;
    cemetery: string;
    cemeteryName: string;
    searchText: string;
};

const cemeteryNames: Record<string, string> = {
    Hi: 'Hildesheimer Straße',
    Fh: 'Friedhof',
};

const splitLastName = (name: string) => {
    const match = name.match(/^(.+?)\s+geb\.?\s+(.+)$/i);

    return {
        lastName: match?.[1]?.trim() || name,
        birthName: match?.[2]?.trim() ?? '',
    };
};

const normalizeDateValue = (value: string) => {
    const trimmedValue = value.trim();
    const isoDateMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const isoMonthMatch = trimmedValue.match(/^(\d{4})-(\d{2})$/);
    const isoYearMatch = trimmedValue.match(/^\d{4}$/);

    if (isoDateMatch) {
        return `${isoDateMatch[3]}${isoDateMatch[2]}${isoDateMatch[1]}`;
    }

    if (isoMonthMatch) {
        return `${isoMonthMatch[2]}${isoMonthMatch[1]}`;
    }

    if (isoYearMatch) {
        return isoYearMatch[0];
    }

    return trimmedValue.replace(/\D/g, '');
};

const parseGraves = (csv: string): GraveRecord[] => {
    const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);

    return lines.slice(1).map((line) => {
        const columns = line.split(';');
        const id = columns[0] ?? '';
        const cemeteryCode = columns[1] ?? '';
        const graveNumber = columns[4] ?? '';
        const name = columns[8] || 'Unbekannt';
        const { lastName, birthName } = splitLastName(name);
        const firstName = columns[9] || '';
        const birthDate = columns[15] || columns[25] || 'Unbekannt';
        const deathDate = columns[19] || columns[26] || 'Unbekannt';
        const cemeteryName = cemeteryNames[cemeteryCode] ?? cemeteryCode;
        const cemetery = [cemeteryName, graveNumber && `Grab ${graveNumber}`]
            .filter(Boolean)
            .join(' · ');
        const searchText = [
            firstName,
            lastName,
            birthName,
            birthDate,
            deathDate,
            cemetery,
            columns[18],
            columns[21],
        ].join(' ').toLowerCase();

        return {
            id,
            cemeteryCode,
            graveNumber,
            displayLastName: name,
            lastName,
            firstName,
            birthName,
            birthDate,
            deathDate,
            cemetery,
            cemeteryName,
            searchText,
        };
    });
};

const graves = parseGraves(graveCsv);
const cemeteryOptions = Array.from(
    new Set(graves.map((grave) => grave.cemeteryName).filter(Boolean)),
).sort((left, right) => left.localeCompare(right, 'de'));

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
