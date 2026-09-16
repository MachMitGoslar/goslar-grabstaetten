import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Seo } from '../components/Seo.tsx';
import {
    analyticsApiBaseUrl,
    createAdminAccessCode,
    getAnalyticsAuthHeaders,
    analyticsCredentialsKey,
    logoutAdmin,
    type AdminAccessCode,
} from '../analytics/adminAuth.ts';
import './Analytics.css';

type AdminPermission = 'statistics' | 'grave_texts' | 'grave_text_roles' | 'data_import' | 'profile_management';
type AnalyticsUser = {
    id: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    permissions: AdminPermission[];
    password_set_at: string | null;
    auth_code_sent_at: string | null;
    created_at: string;
};

const permissionLabels: Record<AdminPermission, string> = {
    statistics: 'Statistiken ansehen',
    grave_texts: 'Grabtexte bearbeiten',
    grave_text_roles: 'Rollen bearbeiten',
    data_import: 'Datenimport starten',
    profile_management: 'Profile verwalten',
};

export const AnalyticsProfilesPage = () => {
    const [credentials, setCredentials] = useState('');
    const [hasCheckedCredentials, setHasCheckedCredentials] = useState(false);
    const [users, setUsers] = useState<AnalyticsUser[]>([]);
    const [bootstrapUser, setBootstrapUser] = useState('');
    const [availablePermissions, setAvailablePermissions] = useState<AdminPermission[]>([]);
    const [message, setMessage] = useState('');
    const [forbidden, setForbidden] = useState(false);
    const [editingUserId, setEditingUserId] = useState('');
    const [editingPermissions, setEditingPermissions] = useState<AdminPermission[]>([]);
    const [generatedAccessByUserId, setGeneratedAccessByUserId] = useState<Record<string, AdminAccessCode>>({});

    const loadUsers = useCallback(async () => {
        const result = await fetch(`${analyticsApiBaseUrl}/api/analytics/users`, { credentials: 'include', headers: getAnalyticsAuthHeaders(credentials) });
        if (result.status === 401 || result.status === 403) { setForbidden(true); return; }
        if (!result.ok) throw new Error(`HTTP ${result.status}`);
        const data = await result.json() as { users: AnalyticsUser[]; bootstrapUser: string; availablePermissions: AdminPermission[] };
        setUsers(data.users); setBootstrapUser(data.bootstrapUser); setAvailablePermissions(data.availablePermissions);
    }, [credentials]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setCredentials(sessionStorage.getItem(analyticsCredentialsKey) ?? '1');
            setHasCheckedCredentials(true);
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!credentials) return;
        const timer = window.setTimeout(() => void loadUsers().catch(() => setMessage('Profile konnten nicht geladen werden.')), 0);
        return () => window.clearTimeout(timer);
    }, [credentials, loadUsers]);

    if (!hasCheckedCredentials) return null;
    if (!credentials || forbidden) return <Navigate to="/admin/statistik" replace />;

    const createUser = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); setMessage('');
        const form = event.currentTarget; const data = new FormData(form);
        const permissions = data.getAll('permissions').map(String);
        const result = await fetch(`${analyticsApiBaseUrl}/api/analytics/users`, {
            method: 'POST', credentials: 'include', headers: { ...getAnalyticsAuthHeaders(credentials), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firstName: data.get('firstName'),
                lastName: data.get('lastName'),
                username: data.get('username'),
                permissions,
            }),
        });
        const body = await result.json().catch(() => ({})) as { error?: string; user?: AnalyticsUser; access?: AdminAccessCode };
        if (!result.ok || !body.access || !body.user) {
            setMessage(body.error ?? 'Profil konnte nicht angelegt werden.');
            return;
        }
        form.reset();
        setGeneratedAccessByUserId((items) => ({ ...items, [body.user!.id]: normalizeAccessUrl(body.access!) }));
        setMessage('');
        await loadUsers();
    };

    const startEditingUser = (user: AnalyticsUser) => {
        setMessage('');
        setEditingUserId(user.id);
        setEditingPermissions(user.permissions);
    };

    const toggleEditingPermission = (permission: AdminPermission) => {
        setEditingPermissions((permissions) => permissions.includes(permission)
            ? permissions.filter((item) => item !== permission)
            : [...permissions, permission]);
    };

    const cancelEditingUser = () => {
        setEditingUserId('');
        setEditingPermissions([]);
    };

    const saveUser = async (user: AnalyticsUser) => {
        setMessage('');
        const result = await fetch(`${analyticsApiBaseUrl}/api/analytics/users/${user.id}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { ...getAnalyticsAuthHeaders(credentials), 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions: editingPermissions }),
        });
        if (!result.ok) {
            const body = await result.json().catch(() => ({})) as { error?: string };
            setMessage(body.error ?? 'Profil konnte nicht gespeichert werden.');
            return;
        }
        setMessage('Profil wurde gespeichert.');
        cancelEditingUser();
        await loadUsers();
    };

    const deleteUser = async (user: AnalyticsUser) => {
        if (!window.confirm(`Profil „${formatUserLabel(user)}“ wirklich löschen?`)) return;
        const result = await fetch(`${analyticsApiBaseUrl}/api/analytics/users/${user.id}`, { method: 'DELETE', credentials: 'include', headers: getAnalyticsAuthHeaders(credentials) });
        if (!result.ok) { setMessage('Profil konnte nicht gelöscht werden.'); return; }
        setGeneratedAccessByUserId((items) => {
            const nextItems = { ...items };
            delete nextItems[user.id];
            return nextItems;
        });
        setMessage('Profil wurde gelöscht.'); await loadUsers();
    };

    const requestAccessCode = async (user: AnalyticsUser) => {
        setMessage('');
        try {
            const result = await createAdminAccessCode(credentials, user.id);
            setGeneratedAccessByUserId((items) => ({ ...items, [user.id]: normalizeAccessUrl(result.access) }));
            void result.message;
            setMessage('');
            await loadUsers();
        } catch (accessError) {
            setMessage(accessError instanceof Error ? accessError.message : 'Zugangscode konnte nicht erstellt werden.');
        }
    };

    const logout = async () => {
        await logoutAdmin();
        setCredentials('');
    };

    return <main className="analytics-page">
        <Seo title="Dashboard-Profile" description="Geschützte Profilverwaltung" path="/admin/profile" />
        <header className="analytics-header">
            <div><p>Administration</p><h1>Dashboard-Profile</h1></div>
            <div className="analytics-header-actions">
                <nav className="analytics-main-nav" aria-label="Admin-Hauptbereiche">
                    <Link to="/admin">Grabtexte</Link>
                    <Link to="/admin/statistik">Statistik</Link>
                    <Link to="/admin/profile" aria-current="page">Profile</Link>
                </nav>
                <div className="analytics-account-actions" aria-label="Konto">
                    <Link to="/admin/passwort">Passwort</Link>
                    <button type="button" onClick={() => void logout()}>Abmelden</button>
                </div>
            </div>
        </header>
        <section className="analytics-users analytics-standalone">
            <h2>Profile verwalten</h2>
            <p>Lege fest, welche Admin-Seiten und Funktionen ein Profil verwenden darf.</p>
            <section className="analytics-profile-section">
                <h3>Bestehende Profile</h3>
                <div className="analytics-user-list">
                    <div><span>{bootstrapUser}</span><small>Hauptkonto · alle Rechte · nicht löschbar</small></div>
                    {users.map((user) => {
                        const isEditing = editingUserId === user.id;
                        const permissionOptions = availablePermissions.length ? availablePermissions : Object.keys(permissionLabels) as AdminPermission[];
                        const generatedAccess = generatedAccessByUserId[user.id];
                        return <div key={user.id} className={isEditing ? 'analytics-user-list__item--editing' : undefined}>
                            <span>{formatUserLabel(user)}</span>
                            <small>
                                @{user.username}
                                {' · '}
                                Angelegt am {new Date(user.created_at).toLocaleDateString('de-DE')}
                                {' · '}
                                {user.password_set_at ? 'Passwort gesetzt' : 'Einrichtung offen'}
                                {!isEditing && <> · {formatPermissions(user.permissions)}</>}
                            </small>
                            {generatedAccess && (
                                <AccessCodeCard access={generatedAccess} />
                            )}
                            {isEditing && (
                                <fieldset className="analytics-permissions analytics-permissions--compact">
                                    <legend>Berechtigungen bearbeiten</legend>
                                    {permissionOptions.map((permission) => (
                                        <label key={permission}>
                                            <input
                                                type="checkbox"
                                                checked={editingPermissions.includes(permission)}
                                                onChange={() => toggleEditingPermission(permission)}
                                            />
                                            <span>{permissionLabels[permission]}</span>
                                        </label>
                                    ))}
                                </fieldset>
                            )}
                            <div className="analytics-user-actions">
                                {isEditing ? (
                                    <>
                                        <button type="button" onClick={() => void saveUser(user)}>Speichern</button>
                                        <button type="button" className="analytics-secondary" onClick={cancelEditingUser}>Abbrechen</button>
                                    </>
                                ) : (
                                    <button type="button" className="analytics-secondary" onClick={() => startEditingUser(user)}>Bearbeiten</button>
                                )}
                                <button type="button" className="analytics-secondary" onClick={() => void requestAccessCode(user)}>
                                    Zugangscode erstellen
                                </button>
                                <button type="button" className="analytics-delete" onClick={() => void deleteUser(user)}>Löschen</button>
                            </div>
                        </div>;
                    })}
                </div>
            </section>
            <form className="analytics-user-form" onSubmit={(event) => void createUser(event)}>
                <section className="analytics-profile-section analytics-profile-section--new">
                    <h3>Neues Profil</h3>
                    <div className="analytics-user-fields">
                        <label>Vorname<input name="firstName" type="text" autoComplete="given-name" maxLength={120} required /></label>
                        <label>Nachname<input name="lastName" type="text" autoComplete="family-name" maxLength={120} required /></label>
                        <label>Nutzername<input name="username" type="text" autoComplete="username" pattern="[a-z0-9][a-z0-9._-]{2,63}" title="3–64 Zeichen: Kleinbuchstaben, Zahlen, Punkt, Unterstrich und Bindestrich" required /></label>
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

const formatUserLabel = (user: Pick<AnalyticsUser, 'first_name' | 'last_name' | 'username'>) => {
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    return fullName || user.username;
};

const normalizeAccessUrl = (access: AdminAccessCode): AdminAccessCode => ({
    ...access,
    url: access.path ? `${window.location.origin}${access.path}` : access.url,
});

const AccessCodeCard = ({ access }: { access: AdminAccessCode }) => {
    const [copiedField, setCopiedField] = useState<'url' | 'code' | ''>('');
    const copyTimer = useRef<number | null>(null);

    const copy = (field: 'url' | 'code', value: string) => {
        void navigator.clipboard?.writeText(value);
        setCopiedField(field);
        if (copyTimer.current) window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopiedField(''), 1600);
    };

    useEffect(() => () => {
        if (copyTimer.current) window.clearTimeout(copyTimer.current);
    }, []);

    return (
        <section className="analytics-access-card" aria-label="Aktueller Zugangscode">
            <div>
                <strong>{access.purpose === 'setup' ? 'Einrichtungscode' : 'Neuer Zugangscode'}</strong>
                <span>{formatAccessValidity(access.expiresInMinutes)} gültig</span>
            </div>
            <label>
                Link zur Einrichtung
                <div className="analytics-access-field">
                    <input value={access.url} readOnly onFocus={(event) => event.currentTarget.select()} />
                    <button type="button" className="analytics-secondary" data-copied={copiedField === 'url'} onClick={() => copy('url', access.url)}>
                        {copiedField === 'url' ? 'Kopiert' : 'Kopieren'}
                    </button>
                </div>
            </label>
            <label>
                Code
                <div className="analytics-access-field analytics-access-field--code">
                    <input value={access.code} readOnly onFocus={(event) => event.currentTarget.select()} />
                    <button type="button" className="analytics-secondary" data-copied={copiedField === 'code'} onClick={() => copy('code', access.code)}>
                        {copiedField === 'code' ? 'Kopiert' : 'Kopieren'}
                    </button>
                </div>
            </label>
        </section>
    );
};

const formatAccessValidity = (minutes: number) => {
    if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return hours === 1 ? '1 Stunde' : `${hours} Stunden`;
    }
    return `${minutes} Minuten`;
};
