import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Seo } from '../components/Seo.tsx';
import './Analytics.css';

type Metric = { label: string; clicks: number };
type ComparisonMetric = { value: number; previous: number; changePercent: number | null };
type AnalyticsSummary = {
    days: number;
    totalClicks: number;
    daily: Metric[];
    pages: Metric[];
    buttons: Metric[];
    stations: Metric[];
    insights: {
        homeViews: ComparisonMetric;
        graveSearchViews: ComparisonMetric;
        searchesStarted: ComparisonMetric;
        graveDetailViews: ComparisonMetric;
        tourClicks: ComparisonMetric;
        onboardingViews: ComparisonMetric;
        mapViews: ComparisonMetric;
        onboardingCompletionRate: number;
    };
    quality: { lastEventAt: string | null; ambiguousEvents: number; legacyEvents: number };
};

const apiBaseUrl = import.meta.env.VITE_API_URL ?? '';
const credentialsKey = 'analytics-admin-credentials';

const encodeCredentials = (user: string, password: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(`${user}:${password}`)));

const MetricBars = ({ items }: { items: Metric[] }) => {
    const maximum = Math.max(...items.map((item) => item.clicks), 1);

    return items.length ? (
        <div className="analytics-bars">
            {items.map((item) => (
                <div className="analytics-bar" key={item.label}>
                    <div className="analytics-bar__label">
                        <span>{item.label}</span><strong>{item.clicks}</strong>
                    </div>
                    <div className="analytics-bar__track">
                        <span style={{ width: `${(item.clicks / maximum) * 100}%` }} />
                    </div>
                </div>
            ))}
        </div>
    ) : <p className="analytics-empty">Für diesen Zeitraum liegen keine Daten vor.</p>;
};

const KpiCard = ({ metric, label, definition }: {
    metric: ComparisonMetric;
    label: string;
    definition: string;
}) => (
    <article title={definition}>
        <strong>{metric.value}</strong>
        <span>{label}</span>
        <small className={metric.changePercent !== null && metric.changePercent < 0 ? 'is-negative' : ''}>
            {metric.changePercent === null
                ? 'Kein Vergleichswert'
                : `${metric.changePercent >= 0 ? '+' : ''}${metric.changePercent} % zum vorherigen Zeitraum`}
        </small>
    </article>
);

const Funnel = ({ title, stages }: { title: string; stages: Array<{ label: string; value: number }> }) => {
    const maximum = Math.max(stages[0]?.value ?? 0, 1);

    return (
        <section className="analytics-funnel">
            <h2>{title}</h2>
            {stages.map((stage, index) => {
                const previous = stages[index - 1]?.value;
                const conversion = previous ? Math.round((stage.value / previous) * 100) : null;
                return <div className="analytics-funnel__step" key={stage.label}>
                    <div><span>{stage.label}</span><strong>{stage.value}</strong></div>
                    <div className="analytics-funnel__track"><span style={{ width: `${(stage.value / maximum) * 100}%` }} /></div>
                    {conversion !== null && <small>{conversion} % der vorherigen Stufe</small>}
                </div>;
            })}
        </section>
    );
};

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
                {credentials && <button type="button" onClick={() => {
                    sessionStorage.removeItem(credentialsKey); setCredentials(''); setSummary(null);
                }}>Abmelden</button>}
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
                        <section className="analytics-total"><span>Klicks in {summary.days} Tagen</span><strong>{summary.totalClicks}</strong></section>
                        <section className="analytics-insights analytics-wide">
                            <h2>Nutzung im Überblick</h2>
                            <div className="analytics-kpis">
                                <KpiCard metric={summary.insights.homeViews} label="Aufrufe der Startseite" definition="Aufruf der Route /." />
                                <KpiCard metric={summary.insights.graveSearchViews} label="Grabstellensuche geöffnet" definition="Aufruf der Übersichtsseite /grabstellensuche." />
                                <KpiCard metric={summary.insights.searchesStarted} label="Aktive Suchen" definition="API-Suche mit mindestens einem Suchbegriff oder Filter; Suchinhalte werden nicht gespeichert." />
                                <KpiCard metric={summary.insights.graveDetailViews} label="Grabdetails geöffnet" definition="Aufruf einer Grabdetailseite nach Auswahl eines Ergebnisses." />
                                <KpiCard metric={summary.insights.tourClicks} label="Tour gewählt" definition="Klick auf Friedhofstour Erinnerungskultur auf der Startseite." />
                                <KpiCard metric={summary.insights.mapViews} label="Tourkarte erreicht" definition="Aufruf der Karte nach dem Tour-Onboarding." />
                            </div>
                        </section>
                        <Funnel title="Funnel Grabstellensuche" stages={[
                            { label: 'Grabstellensuche geöffnet', value: summary.insights.graveSearchViews.value },
                            { label: 'Aktive Suche gestartet', value: summary.insights.searchesStarted.value },
                            { label: 'Grabdetail geöffnet', value: summary.insights.graveDetailViews.value },
                        ]} />
                        <Funnel title="Funnel Friedhofstour" stages={[
                            { label: 'Tour gewählt', value: summary.insights.tourClicks.value },
                            { label: 'Onboarding geöffnet', value: summary.insights.onboardingViews.value },
                            { label: 'Karte erreicht', value: summary.insights.mapViews.value },
                        ]} />
                        <p className="analytics-funnel-note analytics-wide">
                            Die Funnels vergleichen aggregierte Ereignisse. Da keine Nutzer- oder Session-ID gespeichert wird,
                            stellen die Prozentwerte keine Quote eindeutig identifizierter Personen dar.
                        </p>
                        <section className="analytics-wide">
                            <h2>Geöffnete Tour-Stationen</h2>
                            <MetricBars items={summary.stations} />
                        </section>
                        <section><h2>Klicks pro Tag</h2><MetricBars items={summary.daily} /></section>
                        <section><h2>Seitenaufrufe</h2><MetricBars items={summary.pages} /></section>
                        <details className="analytics-details analytics-wide">
                            <summary>Technische Detaildaten anzeigen</summary>
                            <h2>Weitere Button-Klicks</h2><MetricBars items={summary.buttons} />
                            <div className="analytics-quality">
                                <span>Letztes Ereignis: {summary.quality.lastEventAt ? new Date(summary.quality.lastEventAt).toLocaleString('de-DE') : '–'}</span>
                                <span>Uneindeutige Kennungen: {summary.quality.ambiguousEvents}</span>
                                <span>Alte Ereignisse ohne Buttonkennung: {summary.quality.legacyEvents}</span>
                            </div>
                        </details>
                    </div>}
                </>
            )}
            {error && <p className="analytics-error">{error}</p>}
        </main>
    );
};
