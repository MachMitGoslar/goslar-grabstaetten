import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo.tsx';
import { analyticsApiBaseUrl as apiBaseUrl, analyticsCredentialsKey as credentialsKey } from '../analytics/adminAuth.ts';
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

const encodeCredentials = (user: string, password: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(`${user}:${password}`)));

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
    const [credentials, setCredentials] = useState(() => sessionStorage.getItem(credentialsKey) ?? '');
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [days, setDays] = useState(30);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const loadSummary = useCallback(async (authorization: string, period: number) => {
        setLoading(true);
        setError('');

        try {
            const result = await fetch(`${apiBaseUrl}/api/analytics/summary?days=${period}`, {
                headers: { Authorization: `Basic ${authorization}` },
            });

            if (result.status === 401) {
                sessionStorage.removeItem(credentialsKey);
                setCredentials('');
                setSummary(null);
                setError('Benutzername oder Passwort ist falsch.');
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
        if (!credentials) return;

        const timer = window.setTimeout(() => void loadSummary(credentials, days), 0);
        return () => window.clearTimeout(timer);
    }, [credentials, days, loadSummary]);

    const login = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const encoded = encodeCredentials(String(form.get('user')), String(form.get('password')));
        sessionStorage.setItem(credentialsKey, encoded);
        setCredentials(encoded);
    };

    return (
        <main className="analytics-page">
            <Seo title="Nutzungsstatistik" description="Geschützte Nutzungsstatistik" path="/admin/statistik" />
            <header className="analytics-header">
                <div><p>Administration</p><h1>Nutzungsstatistik</h1></div>
                {credentials && <div className="analytics-header-actions">
                    <Link to="/admin">Admin-Plattform</Link>
                    {summary?.canManageUsers && <Link to="/admin/profile">Profile</Link>}
                    <button type="button" onClick={() => {
                    sessionStorage.removeItem(credentialsKey); setCredentials(''); setSummary(null);
                    }}>Abmelden</button>
                </div>}
            </header>

            {!credentials ? (
                <form className="analytics-login" onSubmit={login}>
                    <h2>Anmelden</h2>
                    <label>Benutzername<input name="user" autoComplete="username" required /></label>
                    <label>Passwort<input name="password" type="password" autoComplete="current-password" required /></label>
                    <button type="submit">Statistik öffnen</button>
                </form>
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
                            {summary.quality.legacyEvents > 0 && (
                                <p className="analytics-funnel-note">
                                    Hinweis: {summary.quality.legacyEvents} ältere Seitenaufrufe enthalten noch keine Besucherkennung und werden nicht als eindeutige Besucher gezählt.
                                </p>
                            )}
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
