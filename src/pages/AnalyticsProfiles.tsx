import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Seo } from '../components/Seo.tsx';
import { analyticsApiBaseUrl, getAnalyticsAuthHeaders, getAnalyticsCredentials } from '../analytics/adminAuth.ts';
import './Analytics.css';

type AdminPermission = 'statistics' | 'grave_texts' | 'grave_text_roles' | 'data_import' | 'profile_management';
type AnalyticsUser = { id: string; username: string; permissions: AdminPermission[]; created_at: string };

const permissionLabels: Record<AdminPermission, string> = {
    statistics: 'Statistiken ansehen',
    grave_texts: 'Grabtexte bearbeiten',
    grave_text_roles: 'Rollen bearbeiten',
    data_import: 'Datenimport starten',
    profile_management: 'Profile verwalten',
};

export const AnalyticsProfilesPage = () => {
    const credentials = getAnalyticsCredentials();
    const [users, setUsers] = useState<AnalyticsUser[]>([]);
    const [bootstrapUser, setBootstrapUser] = useState('');
    const [availablePermissions, setAvailablePermissions] = useState<AdminPermission[]>([]);
    const [message, setMessage] = useState('');
    const [forbidden, setForbidden] = useState(false);

    const loadUsers = useCallback(async () => {
        const result = await fetch(`${analyticsApiBaseUrl}/api/analytics/users`, { headers: getAnalyticsAuthHeaders(credentials) });
        if (result.status === 401 || result.status === 403) { setForbidden(true); return; }
        if (!result.ok) throw new Error(`HTTP ${result.status}`);
        const data = await result.json() as { users: AnalyticsUser[]; bootstrapUser: string; availablePermissions: AdminPermission[] };
        setUsers(data.users); setBootstrapUser(data.bootstrapUser); setAvailablePermissions(data.availablePermissions);
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
        const permissions = data.getAll('permissions').map(String);
        const result = await fetch(`${analyticsApiBaseUrl}/api/analytics/users`, {
            method: 'POST', headers: { ...getAnalyticsAuthHeaders(credentials), 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: data.get('username'), password: data.get('password'), permissions }),
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
            <div className="analytics-header-actions"><Link to="/admin">Admin-Plattform</Link><Link to="/admin/statistik">Statistik</Link></div>
        </header>
        <section className="analytics-users analytics-standalone">
            <h2>Profile verwalten</h2>
            <p>Lege fest, welche Admin-Seiten und Funktionen ein Profil verwenden darf.</p>
            <section className="analytics-profile-section">
                <h3>Bestehende Profile</h3>
                <div className="analytics-user-list">
                    <div><span>{bootstrapUser}</span><small>Hauptkonto · alle Rechte · nicht löschbar</small></div>
                    {users.map((user) => <div key={user.id}>
                        <span>{user.username}</span>
                        <small>
                            Angelegt am {new Date(user.created_at).toLocaleDateString('de-DE')}
                            {' · '}
                            {formatPermissions(user.permissions)}
                        </small>
                        <button type="button" className="analytics-delete" onClick={() => void deleteUser(user)}>Löschen</button>
                    </div>)}
                </div>
            </section>
            <form className="analytics-user-form" onSubmit={(event) => void createUser(event)}>
                <section className="analytics-profile-section analytics-profile-section--new">
                    <h3>Neues Profil</h3>
                    <div className="analytics-user-fields">
                        <label>Benutzername<input name="username" minLength={3} maxLength={64} pattern="[a-zA-Z0-9._-]+" required /></label>
                        <label>Passwort<input name="password" type="password" minLength={12} maxLength={256} autoComplete="new-password" required /></label>
                    </div>
                    <fieldset className="analytics-permissions">
                        <legend>Berechtigungen</legend>
                        {(availablePermissions.length ? availablePermissions : Object.keys(permissionLabels) as AdminPermission[]).map((permission) => (
                            <label key={permission}>
                                <input
                                    type="checkbox"
                                    name="permissions"
                                    value={permission}
                                    defaultChecked={permission === 'statistics' || permission === 'grave_texts'}
                                />
                                <span>{permissionLabels[permission]}</span>
                            </label>
                        ))}
                    </fieldset>
                    <button type="submit">Profil anlegen</button>
                </section>
            </form>
            {message && <p className="analytics-user-message">{message}</p>}
        </section>
    </main>;
};

const formatPermissions = (permissions: AdminPermission[]) => permissions
    .map((permission) => permissionLabels[permission] ?? permission)
    .join(', ') || 'keine Rechte';
