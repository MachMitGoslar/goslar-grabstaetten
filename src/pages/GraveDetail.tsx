import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import type { Map as LeafletMapInstance } from 'leaflet';
import { useNavigate, useParams } from 'react-router-dom';
import { graves } from '../data/graveData.ts';
import 'leaflet/dist/leaflet.css';
import './GraveDetail.css';

export const GraveDetailPage = () => {
    const navigate = useNavigate();
    const { graveId } = useParams();
    const grave = graves.find((record) => record.id === graveId);

    if (!grave) {
        return (
            <main className="grave-detail-missing">
                <BackButton onClick={() => navigate('/grabstellensuche')} />
                <p>Diese Grabstelle wurde nicht gefunden.</p>
            </main>
        );
    }

    const fullName = [grave.firstName, grave.displayLastName].filter(Boolean).join(' ');
    const descriptionParagraphs = buildDescriptionParagraphs(grave, fullName);

    return (
        <main className="grave-detail-page">
            <BackButton onClick={() => navigate('/grabstellensuche')} />

            <section className="grave-detail-hero" aria-label={grave.cemeteryName}>
                {grave.cemeteryImage && (
                    <img src={grave.cemeteryImage} alt={grave.cemeteryName} />
                )}
            </section>

            <section className="grave-detail-content">
                <h1 className="grave-detail-title">
                    {grave.displayLastName}, {grave.firstName}
                </h1>

                <div className="grave-detail-dates">
                    <span className="grave-detail-meta">
                        <CalendarIcon />
                        {grave.birthDate}
                    </span>

                    <span className="grave-detail-meta">
                        <CrossIcon />
                        {grave.deathDate}
                    </span>
                </div>

                <h2 className="grave-detail-section-heading">Informationen</h2>

                <div className="grave-detail-description">
                    {descriptionParagraphs.map((paragraph) => (
                        <p key={paragraph}>
                            {paragraph.startsWith('Weiteres:\n') ? (
                                <>
                                    <span className="grave-detail-description-label">Weiteres:</span>
                                    {'\n'}
                                    {paragraph.replace('Weiteres:\n', '')}
                                </>
                            ) : (
                                paragraph
                            )}
                        </p>
                    ))}
                </div>

                <h2 className="grave-detail-map-heading">Karte</h2>

                <CemeteryMap
                    latitude={grave.cemeteryLatitude}
                    longitude={grave.cemeteryLongitude}
                    name={grave.cemeteryName}
                    address={grave.cemeteryAddress}
                />

                {grave.navigationUrl && (
                    <a
                        className="grave-detail-nav-link"
                        href={grave.navigationUrl}
                        target="_blank"
                        rel="noreferrer"
                    >
                        <LinkIcon />
                        In Navigationsapp öffnen
                    </a>
                )}
            </section>
        </main>
    );
};

type CemeteryMapProps = {
    latitude?: number;
    longitude?: number;
    name: string;
    address: string;
};

const CemeteryMap = ({ latitude, longitude, name, address }: CemeteryMapProps) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<LeafletMapInstance | null>(null);

    useEffect(() => {
        if (!containerRef.current || latitude === undefined || longitude === undefined) {
            return undefined;
        }

        const primaryColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--color-primary')
            .trim() || '#A88F35';
        const map = L.map(containerRef.current, {
            attributionControl: false,
            zoomControl: true,
            scrollWheelZoom: false,
        }).setView([latitude, longitude], 15);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd',
        }).addTo(map);

        L.control.attribution({
            position: 'bottomright',
            prefix: false,
        }).addAttribution('© OpenStreetMap © CARTO').addTo(map);

        L.marker([latitude, longitude], {
            title: name,
            icon: L.divIcon({
                className: 'grave-detail-leaflet-pin',
                html: `<span style="background:${primaryColor}"></span>`,
                iconSize: [34, 42],
                iconAnchor: [17, 42],
            }),
        }).addTo(map);

        mapRef.current = map;
        window.setTimeout(() => map.invalidateSize(), 0);

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, [address, latitude, longitude, name]);

    if (latitude === undefined || longitude === undefined) {
        return (
            <div className="grave-detail-map grave-detail-map--empty">
                Kartenposition nicht verfügbar.
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="grave-detail-map"
            aria-label={address ? `Karte: ${address}` : `Karte: ${name}`}
        />
    );
};

const buildDescriptionParagraphs = (grave: typeof graves[number], fullName: string) => {
    const graveLocation = [
        `${fullName} liegt begraben auf dem Friedhof ${grave.cemeteryName}`,
        grave.graveNumber && `in Grab ${grave.graveNumber}`,
    ].filter(Boolean).join(' ');

    const deathDetails = [
        `Gestorben ${formatDateForSentence(grave.deathDate)}`,
        grave.age !== 'Unbekannt' && `im Alter von ${grave.age}`,
        grave.burialDate !== 'Unbekannt' && `und begraben ${formatDateForSentence(grave.burialDate)}`,
    ].filter(Boolean).join(' ');

    const birthDetails = grave.birthDate !== 'Unbekannt' || grave.birthPlace !== 'Unbekannt'
        ? `${grave.displayLastName} wurde ${formatDateForSentence(grave.birthDate)} in ${grave.birthPlace} geboren.`
        : '';

    const additionalItems = [
        grave.status && `Stand: ${grave.status}`,
        grave.note && `Anmerkung: ${grave.note}`,
        grave.remark && grave.remark,
    ].filter(Boolean);
    const additionalDetails = additionalItems.length
        ? `Weiteres:\n${additionalItems.join('\n')}`
        : '';

    return [
        `${graveLocation}.`,
        deathDetails && `${deathDetails}.`,
        birthDetails,
        additionalDetails,
    ].filter(Boolean);
};

const formatDateForSentence = (date: string) => {
    if (/^\d{4}$/.test(date)) {
        return `im Jahr ${date}`;
    }

    return `am ${date}`;
};

type BackButtonProps = {
    onClick: () => void;
};

const BackButton = ({ onClick }: BackButtonProps) => (
    <button
        type="button"
        className="grave-detail-back"
        aria-label="Zurück"
        onClick={onClick}
    >
        <BackIcon />
    </button>
);

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

const CalendarIcon = () => (
    <span className="grave-detail-icon-circle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M7 2v3M17 2v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
                stroke="white"
                strokeLinecap="round"
                strokeWidth="2"
            />
        </svg>
    </span>
);

const CrossIcon = () => (
    <span className="grave-detail-icon-circle">
        <svg className="grave-detail-cross" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M12 3v18M7 8h10"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
            />
        </svg>
    </span>
);

const LinkIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path
            d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.4"
        />
    </svg>
);
