import { useEffect, useRef, useState, type MouseEvent } from 'react';
import * as L from 'leaflet';
import type { Map as LeafletMapInstance } from 'leaflet';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchGrave, type GraveRecord } from '../data/graveData.ts';
import 'leaflet/dist/leaflet.css';
import './GraveDetail.css';

export const GraveDetailPage = () => {
    const navigate = useNavigate();
    const { graveId } = useParams();
    const [grave, setGrave] = useState<GraveRecord | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!graveId) {
            return undefined;
        }

        let isMounted = true;

        fetchGrave(graveId)
            .then((graveRecord) => {
                if (!isMounted) {
                    return;
                }

                setGrave(graveRecord);
                setError('');
            })
            .catch(() => {
                if (!isMounted) {
                    return;
                }

                setError('Diese Grabstelle wurde nicht gefunden.');
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [graveId]);

    if (!graveId || isLoading || error || !grave) {
        return (
            <main className="grave-detail-missing">
                <BackButton onClick={() => navigate('/grabstellensuche')} />
                <p>{!graveId || error ? 'Diese Grabstelle wurde nicht gefunden.' : 'Grabstelle wird geladen.'}</p>
            </main>
        );
    }

    const fullName = [grave.firstName, grave.displayLastName].filter(Boolean).join(' ');
    const descriptionParagraphs = buildDescriptionParagraphs(grave, fullName);
    const navigationTarget = {
        address: grave.cemeteryAddress,
        latitude: grave.cemeteryLatitude,
        longitude: grave.cemeteryLongitude,
        name: grave.cemeteryName,
    };
    const navigationUrl = getNavigationUrl(navigationTarget);

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

                {navigationUrl && (
                    <a
                        className="grave-detail-nav-link"
                        href={navigationUrl}
                        onClick={(event) => openNavigationApp(event, navigationTarget)}
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

type NavigationTarget = {
    address: string;
    latitude?: number;
    longitude?: number;
    name: string;
};

const getDestinationValue = ({ address, latitude, longitude }: NavigationTarget) => {
    if (latitude !== undefined && longitude !== undefined) {
        return `${latitude},${longitude}`;
    }

    return address;
};

const getUserAgent = () => {
    if (typeof navigator === 'undefined') {
        return '';
    }

    return navigator.userAgent.toLowerCase();
};

const getNavigationUrl = (target: NavigationTarget) => {
    const destination = getDestinationValue(target);

    if (!destination) {
        return '';
    }

    const userAgent = getUserAgent();

    if (userAgent.includes('android')) {
        return `geo:0,0?q=${encodeURIComponent(`${destination} (${target.name})`)}`;
    }

    if (/iphone|ipad|ipod/.test(userAgent)) {
        return `maps://?daddr=${encodeURIComponent(destination)}`;
    }

    if (userAgent.includes('macintosh') || userAgent.includes('mac os')) {
        return `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}`;
    }

    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
};

const openNavigationApp = (
    event: MouseEvent<HTMLAnchorElement>,
    target: NavigationTarget,
) => {
    const navigationUrl = getNavigationUrl(target);

    if (!navigationUrl) {
        return;
    }

    event.preventDefault();

    if (navigationUrl.startsWith('https://')) {
        window.open(navigationUrl, '_blank', 'noopener,noreferrer');
        return;
    }

    window.location.assign(navigationUrl);
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

const buildDescriptionParagraphs = (grave: GraveRecord, fullName: string) => {
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
