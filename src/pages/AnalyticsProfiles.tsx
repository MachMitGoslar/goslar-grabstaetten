import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Seo } from '../components/Seo.tsx';
import { analyticsApiBaseUrl, getAnalyticsAuthHeaders, getAnalyticsCredentials } from '../analytics/adminAuth.ts';
import './Analytics.css';

type AnalyticsUser = { id: string; username: string; created_at: string };

export const AnalyticsProfilesPage = () => {
    const credentials = getAnalyticsCredentials();
    const [users, setUsers] = useState<AnalyticsUser[]>([]);
    const [bootstrapUser, setBootstrapUser] = useState('');
    const [message, setMessage] = useState('');
    const [forbidden, setForbidden] = useState(false);

    const loadUsers = useCallback(async () => {
        const result = await fetch(`${analyticsApiBaseUrl}/api/analytics/users`, { headers: getAnalyticsAuthHeaders(credentials) });
        if (result.status === 401 || result.status === 403) { setForbidden(true); return; }
        if (!result.ok) throw new Error(`HTTP ${result.status}`);
        const data = await result.json() as { users: AnalyticsUser[]; bootstrapUser: string };
        setUsers(data.users); setBootstrapUser(data.bootstrapUser);
    }, [credentials]);

    useEffect(() => {
        if (!credentials) return;
        const timer = window.setTimeout(() => void loadUsers().catch(() => setMessage('Profile konnten nicht geladen werden.')), 0);
        return () => window.clearTimeout(timer);
    }, [credentials, loadUsers]);

    if (!credentials || forbidden) return <Navigate to="/admin/statistik" replace />;

    const createUser = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); setMessage('');
        const form = event.currentTarget; const data = new FormData(form);
        const result = await fetch(`${analyticsApiBaseUrl}/api/analytics/users`, {
            method: 'POST', headers: { ...getAnalyticsAuthHeaders(credentials), 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: data.get('username'), password: data.get('password') }),
        });
        if (!result.ok) { const body = await result.json() as { error?: string }; setMessage(body.error ?? 'Profil konnte nicht angelegt werden.'); return; }
        form.reset(); setMessage('Profil wurde angelegt.'); await loadUsers();
    };

    const deleteUser = async (user: AnalyticsUser) => {
        if (!window.confirm(`Profil „${user.username}“ wirklich löschen?`)) return;
        const result = await fetch(`${analyticsApiBaseUrl}/api/analytics/users/${user.id}`, { method: 'DELETE', headers: getAnalyticsAuthHeaders(credentials) });
        if (!result.ok) { setMessage('Profil konnte nicht gelöscht werden.'); return; }
        setMessage('Profil wurde gelöscht.'); await loadUsers();
    };

    return <main className="analytics-page">
        <Seo title="Dashboard-Profile" description="Geschützte Profilverwaltung" path="/admin/profile" />
        <header className="analytics-header">
            <div><p>Administration</p><h1>Dashboard-Profile</h1></div>
            <div className="analytics-header-actions"><Link to="/admin/statistik">Statistik</Link></div>
        </header>
        <section className="analytics-users analytics-standalone">
            <h2>Profile verwalten</h2>
            <p>Diese Profile können Statistiken ansehen, aber keine Profile verwalten.</p>
            <div className="analytics-user-list">
                <div><span>{bootstrapUser}</span><small>Hauptkonto · nicht löschbar</small></div>
                {users.map((user) => <div key={user.id}><span>{user.username}</span><small>Angelegt am {new Date(user.created_at).toLocaleDateString('de-DE')}</small><button type="button" className="analytics-delete" onClick={() => void deleteUser(user)}>Löschen</button></div>)}
            </div>
            <form className="analytics-user-form" onSubmit={(event) => void createUser(event)}>
                <label>Benutzername<input name="username" minLength={3} maxLength={64} pattern="[a-zA-Z0-9._-]+" required /></label>
                <label>Passwort<input name="password" type="password" minLength={12} maxLength={256} autoComplete="new-password" required /></label>
                <button type="submit">Profil anlegen</button>
            </form>
            {message && <p className="analytics-user-message">{message}</p>}
        </section>
    </main>;
};
