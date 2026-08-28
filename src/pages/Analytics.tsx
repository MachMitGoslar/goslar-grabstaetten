import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo.tsx';
import { analyticsApiBaseUrl as apiBaseUrl, analyticsCredentialsKey as credentialsKey, clearAnalyticsSession, getAnalyticsAuthHeaders, logoutAdmin } from '../analytics/adminAuth.ts';
import { AdminLoginForm } from '../components/AdminLoginForm.tsx';
import './Analytics.css';

type Metric = { label: string; value: number };
type DailyVisitorMetric = { label: string; visitors: number; legacyEvents: number };
type GraveDetailMetric = { label: string; views: number };
type AnalyticsSummary = {
    days: number;
    overview: {
        visitors: number;
        graveDetailViews: number;
        stationViews: number;
    };
    dailyVisitors: DailyVisitorMetric[];
    graveDetails: {
        daily: GraveDetailMetric[];
        items: GraveDetailMetric[];
    };
    stations: GraveDetailMetric[];
    quality: { lastEventAt: string | null; legacyEvents: number };
    canManageUsers: boolean;
};

const MetricBars = ({ items }: { items: Metric[] }) => {
    const maximum = Math.max(...items.map((item) => item.value), 1);

    return items.length ? (
        <div className="analytics-bars">
            {items.map((item) => (
                <div className="analytics-bar" key={item.label}>
                    <div className="analytics-bar__label">
                        <span>{item.label}</span><strong>{item.value}</strong>
                    </div>
                    <div className="analytics-bar__track">
                        <span style={{ width: `${(item.value / maximum) * 100}%` }} />
                    </div>
                </div>
            ))}
        </div>
    ) : <p className="analytics-empty">Für diesen Zeitraum liegen keine Daten vor.</p>;
};

const KpiCard = ({ value, label, definition }: {
    value: number;
    label: string;
    definition: string;
}) => (
    <article title={definition}>
        <strong>{value}</strong>
        <span>{label}</span>
    </article>
);

const formatDateLabel = (label: string) => new Date(label).toLocaleDateString('de-DE');

export const AnalyticsPage = () => {
    const [credentials, setCredentials] = useState('');
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [days, setDays] = useState(30);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const loadSummary = useCallback(async (authorization: string, period: number) => {
        setLoading(true);
        setError('');

        try {
            const result = await fetch(`${apiBaseUrl}/api/analytics/summary?days=${period}`, {
                credentials: 'include',
                headers: getAnalyticsAuthHeaders(authorization),
            });

            if (result.status === 401) {
                clearAnalyticsSession();
                setCredentials('');
                setSummary(null);
                setError('Mailadresse oder Passwort ist falsch.');
                return;
            }

            if (!result.ok) throw new Error(`HTTP ${result.status}`);
            setSummary(await result.json() as AnalyticsSummary);
        } catch {
            setError('Die Statistik konnte nicht geladen werden.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => setCredentials(sessionStorage.getItem(credentialsKey) ?? '1'), 0);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!credentials) return;

        const timer = window.setTimeout(() => void loadSummary(credentials, days), 0);
        return () => window.clearTimeout(timer);
    }, [credentials, days, loadSummary]);

    const login = () => {
        setCredentials(sessionStorage.getItem(credentialsKey) ?? '1');
    };

    const logout = async () => {
        await logoutAdmin();
        setCredentials('');
        setSummary(null);
    };

    return (
        <main className="analytics-page">
            <Seo title="Nutzungsstatistik" description="Geschützte Nutzungsstatistik" path="/admin/statistik" />
            <header className="analytics-header">
                <div><p>Administration</p><h1>Nutzungsstatistik</h1></div>
                {credentials && <div className="analytics-header-actions">
                    <nav className="analytics-main-nav" aria-label="Admin-Hauptbereiche">
                        <Link to="/admin">Grabtexte</Link>
                        <Link to="/admin/statistik" aria-current="page">Statistik</Link>
                        {summary?.canManageUsers && <Link to="/admin/profile">Profile</Link>}
                    </nav>
                    <div className="analytics-account-actions" aria-label="Konto">
                        <Link to="/admin/passwort">Passwort</Link>
                        <button type="button" onClick={() => void logout()}>Abmelden</button>
                    </div>
                </div>}
            </header>

            {!credentials ? (
                <AdminLoginForm title="Anmelden" submitLabel="Statistik öffnen" onLogin={login} />
            ) : (
                <>
                    <div className="analytics-toolbar">
                        <label>Zeitraum<select value={days} onChange={(event) => setDays(Number(event.target.value))}>
                            <option value={7}>7 Tage</option><option value={30}>30 Tage</option>
                            <option value={90}>90 Tage</option><option value={365}>365 Tage</option>
                        </select></label>
                    </div>
                    {loading && <p>Lade Statistik …</p>}
                    {summary && !loading && <div className="analytics-dashboard">
                        <section className="analytics-insights analytics-wide">
                            <h2>Übersicht der letzten {summary.days} Tage</h2>
                            <div className="analytics-kpis">
                                <KpiCard value={summary.overview.visitors} label="Besucher" definition="Eindeutige anonyme Besucherkennungen mit mindestens einem Seitenaufruf im Zeitraum." />
                                <KpiCard value={summary.overview.graveDetailViews} label="Geöffnete Grabstellendetails" definition="Aufrufe von Grabdetailseiten unter /grabstellensuche/:id." />
                                <KpiCard value={summary.overview.stationViews} label="Geöffnete Tour-Stationen" definition="Aufrufe von Tour-Stationen unter /tour/station/:id." />
                            </div>
                        </section>
                        <section className="analytics-wide">
                            <h2>Besucher pro Tag</h2>
                            <MetricBars items={summary.dailyVisitors.map((item) => ({
                                label: formatDateLabel(item.label),
                                value: item.visitors,
                            }))} />
                        </section>
                        <section>
                            <h2>Grabstellendetails pro Tag</h2>
                            <MetricBars items={summary.graveDetails.daily.map((item) => ({
                                label: formatDateLabel(item.label),
                                value: item.views,
                            }))} />
                        </section>
                        <section>
                            <h2>Häufig geöffnete Grabstellendetails</h2>
                            <MetricBars items={summary.graveDetails.items.map((item) => ({
                                label: item.label,
                                value: item.views,
                            }))} />
                        </section>
                        <section className="analytics-wide">
                            <h2>Öffnungen der jeweiligen Tour-Stationen</h2>
                            <MetricBars items={summary.stations.map((item) => ({
                                label: item.label,
                                value: item.views,
                            }))} />
                        </section>
                        <p className="analytics-quality analytics-wide">
                            Letztes Ereignis: {summary.quality.lastEventAt ? new Date(summary.quality.lastEventAt).toLocaleString('de-DE') : '–'}
                        </p>
                    </div>}
                </>
            )}
            {error && <p className="analytics-error">{error}</p>}
        </main>
    );
};
