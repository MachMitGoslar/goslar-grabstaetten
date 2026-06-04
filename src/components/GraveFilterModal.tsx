import { useState } from 'react';
import './GraveFilterModal.css';

export type GraveFilters = {
    birthDate: string;
    deathDate: string;
    cemetery: string;
    searchFirstName: boolean;
    searchLastName: boolean;
    searchBirthName: boolean;
};

type GraveFilterModalProps = {
    filters: GraveFilters;
    cemeteryOptions: string[];
    onChange: (filters: GraveFilters) => void;
    onClose: () => void;
    onReset: () => void;
};

export const defaultGraveFilters: GraveFilters = {
    birthDate: '',
    deathDate: '',
    cemetery: '',
    searchFirstName: true,
    searchLastName: true,
    searchBirthName: true,
};

export const GraveFilterModal = ({
                                     filters,
                                     cemeteryOptions,
                                     onChange,
                                     onClose,
                                     onReset,
                                 }: GraveFilterModalProps) => {
    const updateFilter = <Key extends keyof GraveFilters>(
        key: Key,
        value: GraveFilters[Key],
    ) => {
        onChange({
            ...filters,
            [key]: value,
        });
    };

    return (
        <div
            className="grave-filter-backdrop"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                className="grave-filter-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="grave-filter-title"
            >
                <header className="grave-filter-header">
                    <h2 className="grave-filter-title" id="grave-filter-title">
                        Filter
                    </h2>

                    <button
                        type="button"
                        className="grave-filter-close"
                        aria-label="Filter schließen"
                        onClick={onClose}
                    >
                        <CloseIcon />
                    </button>
                </header>

                <div className="grave-filter-form">
                    <div className="grave-filter-row">
                        <span className="grave-filter-label">Geburtsdatum</span>
                        <DatePicker
                            value={filters.birthDate}
                            onChange={(value) => updateFilter('birthDate', value)}
                        />
                    </div>

                    <div className="grave-filter-row">
                        <span className="grave-filter-label">Todesdatum</span>
                        <DatePicker
                            value={filters.deathDate}
                            onChange={(value) => updateFilter('deathDate', value)}
                        />
                    </div>

                    <ToggleRow
                        label="Vorname"
                        checked={filters.searchFirstName}
                        onChange={(checked) => updateFilter('searchFirstName', checked)}
                    />

                    <ToggleRow
                        label="Nachname"
                        checked={filters.searchLastName}
                        onChange={(checked) => updateFilter('searchLastName', checked)}
                    />

                    <ToggleRow
                        label="Geburtsname"
                        checked={filters.searchBirthName}
                        onChange={(checked) => updateFilter('searchBirthName', checked)}
                    />

                    <label className="grave-filter-row">
                        <span className="grave-filter-label">Friedhof</span>
                        <select
                            className="grave-filter-control grave-filter-select"
                            value={filters.cemetery}
                            onChange={(event) => updateFilter('cemetery', event.target.value)}
                        >
                            <option value="">Alle Friedhöfe</option>
                            {cemeteryOptions.map((cemetery) => (
                                <option key={cemetery} value={cemetery}>
                                    {cemetery}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <footer className="grave-filter-actions">
                    <button
                        type="button"
                        className="grave-filter-action grave-filter-action--secondary"
                        onClick={onReset}
                    >
                        Zurücksetzen
                    </button>
                    <button
                        type="button"
                        className="grave-filter-action grave-filter-action--primary"
                        onClick={onClose}
                    >
                        Anwenden
                    </button>
                </footer>
            </div>
        </div>
    );
};

type ToggleRowProps = {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
};

const ToggleRow = ({ label, checked, onChange }: ToggleRowProps) => (
    <label className="grave-filter-row">
        <span className="grave-filter-label">{label}</span>
        <span className="grave-filter-switch">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
            />
            <span aria-hidden="true" />
        </span>
    </label>
);

type DatePickerProps = {
    value: string;
    onChange: (value: string) => void;
};

const monthFormatter = new Intl.DateTimeFormat('de-DE', {
    month: 'long',
});

const parseIsoDate = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);

    if (!year || !month || !day) {
        return null;
    }

    return new Date(year, month - 1, day);
};

const parseVisibleMonth = (value: string) => {
    const date = parseIsoDate(value);

    if (date) {
        return date;
    }

    const [year, month] = value.split('-').map(Number);

    if (year && month) {
        return new Date(year, month - 1, 1);
    }

    if (year) {
        return new Date(year, 0, 1);
    }

    return new Date();
};

const toIsoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

const formatDateLabel = (value: string) => {
    const date = parseIsoDate(value);

    if (date) {
        return date.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    }

    const monthMatch = value.match(/^(\d{4})-(\d{2})$/);

    if (monthMatch) {
        return new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1).toLocaleDateString('de-DE', {
            month: 'long',
            year: 'numeric',
        });
    }

    if (/^\d{4}$/.test(value)) {
        return value;
    }

    return 'Datum wählen';
};

const getMonthDays = (visibleMonth: Date) => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const startDate = new Date(year, month, 1 - startOffset);

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index);
        return date;
    });
};

const DatePicker = ({ value, onChange }: DatePickerProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [visibleMonth, setVisibleMonth] = useState(() => parseVisibleMonth(value));
    const days = getMonthDays(visibleMonth);

    const shiftMonth = (direction: number) => {
        setVisibleMonth((currentMonth) => {
            const nextMonth = new Date(currentMonth);
            nextMonth.setMonth(currentMonth.getMonth() + direction);
            return nextMonth;
        });
    };

    const shiftYear = (direction: number) => {
        setVisibleMonth((currentMonth) => {
            const nextMonth = new Date(currentMonth);
            nextMonth.setFullYear(currentMonth.getFullYear() + direction);
            return nextMonth;
        });
    };

    const setYear = (year: string) => {
        const parsedYear = Number(year);

        if (!Number.isInteger(parsedYear) || parsedYear < 1 || parsedYear > 9999) {
            return;
        }

        setVisibleMonth((currentMonth) => {
            const nextMonth = new Date(currentMonth);
            nextMonth.setFullYear(parsedYear);
            return nextMonth;
        });
    };

    const selectVisibleYear = () => {
        onChange(String(visibleMonth.getFullYear()));
        setIsOpen(false);
    };

    const selectVisibleMonth = () => {
        const year = visibleMonth.getFullYear();
        const month = String(visibleMonth.getMonth() + 1).padStart(2, '0');

        onChange(`${year}-${month}`);
        setIsOpen(false);
    };

    return (
        <div className="grave-filter-date-picker">
            <button
                type="button"
                className={`grave-filter-date-trigger${value ? ' grave-filter-date-trigger--set' : ''}`}
                onClick={() => setIsOpen((open) => !open)}
            >
                <span>{formatDateLabel(value)}</span>
                <CalendarIcon />
            </button>

            {isOpen && (
                <div className="grave-filter-calendar" role="dialog" aria-label="Datum auswählen">
                    <div className="grave-filter-calendar-header">
                        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Vorheriger Monat">
                            <ChevronIcon direction="left" />
                        </button>
                        <button
                            type="button"
                            className="grave-filter-calendar-month"
                            onClick={selectVisibleMonth}
                            aria-label="Monat auswählen"
                        >
                            {monthFormatter.format(visibleMonth)}
                        </button>
                        <button type="button" onClick={() => shiftMonth(1)} aria-label="Nächster Monat">
                            <ChevronIcon direction="right" />
                        </button>
                    </div>

                    <div className="grave-filter-calendar-year">
                        <button type="button" onClick={() => shiftYear(-1)} aria-label="Vorheriges Jahr">
                            <ChevronIcon direction="left" />
                        </button>
                        <input
                            type="number"
                            min="1"
                            max="9999"
                            value={visibleMonth.getFullYear()}
                            aria-label="Jahr auswählen"
                            onClick={selectVisibleYear}
                            onChange={(event) => setYear(event.target.value)}
                        />
                        <button type="button" onClick={() => shiftYear(1)} aria-label="Nächstes Jahr">
                            <ChevronIcon direction="right" />
                        </button>
                    </div>

                    <div className="grave-filter-calendar-weekdays" aria-hidden="true">
                        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((weekday) => (
                            <span key={weekday}>{weekday}</span>
                        ))}
                    </div>

                    <div className="grave-filter-calendar-grid">
                        {days.map((date) => {
                            const isoDate = toIsoDate(date);
                            const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
                            const isSelected = value === isoDate;

                            return (
                                <button
                                    type="button"
                                    key={isoDate}
                                    className={[
                                        'grave-filter-calendar-day',
                                        isCurrentMonth ? '' : 'grave-filter-calendar-day--muted',
                                        isSelected ? 'grave-filter-calendar-day--selected' : '',
                                    ].filter(Boolean).join(' ')}
                                    onClick={() => {
                                        onChange(isoDate);
                                        setIsOpen(false);
                                    }}
                                >
                                    {date.getDate()}
                                </button>
                            );
                        })}
                    </div>

                    {value && (
                        <button
                            type="button"
                            className="grave-filter-calendar-clear"
                            onClick={() => {
                                onChange('');
                                setIsOpen(false);
                            }}
                        >
                            Datum löschen
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

const CloseIcon = () => (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <path
            d="M8 8l16 16M24 8 8 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.8"
        />
    </svg>
);

const CalendarIcon = () => (
    <svg className="grave-filter-calendar-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
            d="M7 2v3M17 2v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
        />
    </svg>
);

const ChevronIcon = ({ direction }: { direction: 'left' | 'right' }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
            d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.4"
        />
    </svg>
);
