import { useNavigate } from 'react-router-dom';
import './GeoTour.css';

const geotourUrl = import.meta.env.VITE_GEOTOUR_URL ?? 'http://localhost:8101';

export const GeoTourPage = () => {
    const navigate = useNavigate();

    return (
        <main className="geo-tour-page">
            <header className="geo-tour-header">
                <button
                    type="button"
                    className="geo-tour-back"
                    aria-label="Zurück"
                    onClick={() => navigate('/')}
                >
                    <BackIcon />
                </button>

            </header>

            <section className="geo-tour-frame-wrap" aria-label="Geotour Ansicht">
                <iframe
                    className="geo-tour-frame"
                    src={geotourUrl}
                    title="Geotour"
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                />
            </section>
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
