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

const MetricLineChart = ({ items, scrollable = true }: { items: Metric[]; scrollable?: boolean }) => {
    const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

    if (!items.length) {
        return <p className="analytics-empty">Für diesen Zeitraum liegen keine Daten vor.</p>;
    }

    if (items.length === 1) {
        return (
            <div className="analytics-single-day-chart">
                <div>
                    <span>{items[0].label}</span>
                    <strong>{items[0].value}</strong>
                </div>
                <p>Nur ein Tag mit Daten im ausgewählten Zeitraum.</p>
            </div>
        );
    }

    const width = scrollable ? 720 : 420;
    const height = 240;
    const padding = { top: 24, right: 28, bottom: 26, left: 46 };
    const tooltipWidth = 116;
    const tooltipHeight = 50;
    const tooltipX = (x: number) => Math.min(Math.max(x - tooltipWidth / 2, padding.left + 4), width - padding.right - tooltipWidth);
    const tooltipTextX = (x: number) => Math.min(Math.max(x, padding.left + tooltipWidth / 2 + 4), width - padding.right - tooltipWidth / 2);
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const maximum = Math.max(...items.map((item) => item.value), 1);
    const points = items.map((item, index) => {
        const x = padding.left + (items.length === 1 ? plotWidth / 2 : (index / (items.length - 1)) * plotWidth);
        const y = padding.top + plotHeight - (item.value / maximum) * plotHeight;
        return { ...item, x, y };
    });
    const activePoint = activePointIndex === null ? null : points[activePointIndex];
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    const areaPath = `${path} L ${points.at(-1)?.x ?? padding.left} ${padding.top + plotHeight} L ${points[0]?.x ?? padding.left} ${padding.top + plotHeight} Z`;
    return (
        <div className={`analytics-line-chart${scrollable ? '' : ' analytics-line-chart--fit'}`} role="img" aria-label="Liniendiagramm pro Tag">
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
                <line className="analytics-line-chart__axis" x1={padding.left} y1={padding.top + plotHeight} x2={width - padding.right} y2={padding.top + plotHeight} />
                <line className="analytics-line-chart__axis" x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} />
                {[0, 0.5, 1].map((tick) => {
                    const y = padding.top + plotHeight - tick * plotHeight;
                    return <line key={tick} className="analytics-line-chart__grid" x1={padding.left} y1={y} x2={width - padding.right} y2={y} />;
                })}
                <path className="analytics-line-chart__area" d={areaPath} />
                <path className="analytics-line-chart__line" d={path} />
                {points.map((point, index) => (
                    <g key={`${point.label}-${point.x}`}>
                        <circle
                            className="analytics-line-chart__hit-area"
                            cx={point.x}
                            cy={point.y}
                            r="13"
                            onBlur={() => setActivePointIndex(null)}
                            onFocus={() => setActivePointIndex(index)}
                            onMouseEnter={() => setActivePointIndex(index)}
                            onMouseLeave={() => setActivePointIndex(null)}
                            tabIndex={0}
                        />
                        <circle className="analytics-line-chart__point" data-active={activePointIndex === index} cx={point.x} cy={point.y} r={activePointIndex === index ? '5.5' : '3'} />
                    </g>
                ))}
                {activePoint && (
                    <g className="analytics-line-chart__tooltip" pointerEvents="none">
                        <line className="analytics-line-chart__hover-line" x1={activePoint.x} y1={padding.top} x2={activePoint.x} y2={padding.top + plotHeight} />
                        <rect x={tooltipX(activePoint.x)} y={padding.top + 8} width={tooltipWidth} height={tooltipHeight} rx="10" />
                        <text
                            x={tooltipTextX(activePoint.x)}
                            y={padding.top + 28}
                            textAnchor="middle"
                        >
                            {formatCompactDateLabel(activePoint.label)}
                        </text>
                        <text
                            x={tooltipTextX(activePoint.x)}
                            y={padding.top + 47}
                            textAnchor="middle"
                        >
                            {activePoint.value} Aufrufe
                        </text>
                    </g>
                )}
                {[0, 0.5, 1].map((tick) => {
                    const y = padding.top + plotHeight - tick * plotHeight;
                    return <text key={tick} className="analytics-line-chart__y-label" x={padding.left - 10} y={y + 4} textAnchor="end">{Math.round(maximum * tick)}</text>;
                })}
            </svg>
            <div className="analytics-line-chart__summary">
                <span>Maximum: <strong>{maximum}</strong></span>
                <span>Gesamt: <strong>{items.reduce((sum, item) => sum + item.value, 0)}</strong></span>
            </div>
        </div>
    );
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
const formatCompactDateLabel = (label: string) => {
    const date = new Date(label);
    if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    }

    const match = label.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (match) {
        return `${match[1].padStart(2, '0')}.${match[2].padStart(2, '0')}.`;
    }

    return label;
};

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
                setError('Nutzername oder Passwort ist falsch.');
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
                            <MetricLineChart items={summary.dailyVisitors.map((item) => ({
                                label: formatDateLabel(item.label),
                                value: item.visitors,
                            }))} />
                        </section>
                        <section>
                            <h2>Grabstellendetails pro Tag</h2>
                            <MetricLineChart items={summary.graveDetails.daily.map((item) => ({
                                label: formatDateLabel(item.label),
                                value: item.views,
                            }))} scrollable={false} />
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
