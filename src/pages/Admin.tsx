import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApiBaseUrl as apiBaseUrl, analyticsCredentialsKey as credentialsKey, clearAnalyticsSession, getAnalyticsAuthHeaders, logoutAdmin } from '../analytics/adminAuth.ts';
import { AdminLoginForm } from '../components/AdminLoginForm.tsx';
import { GraveCard } from '../components/GraveCard.tsx';
import { Seo } from '../components/Seo.tsx';
import { fetchGravesPage, type GraveRecord } from '../data/graveData.ts';
import './Analytics.css';
import './Admin.css';

type GraveTextItem = {
    id: string;
    graveId: string;
    graveLabel: string;
    text: string;
    role: string;
    date: string;
    createdBy: string;
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
};

type GraveTextRole = {
    id: string;
    name: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
};

type AdminPermission = 'statistics' | 'grave_texts' | 'grave_text_roles' | 'data_import' | 'profile_management';

type DataImportStatus = {
    running: boolean;
    lastRun: null | {
        id: string;
        startedAt: string;
        finishedAt: string | null;
        status: 'running' | 'succeeded' | 'failed';
        exitCode: number | null;
        startedBy: string;
        output: string;
    };
};

type GraveTextFormState = {
    id: string;
    text: string;
    role: string;
    date: string;
};

const fallbackAuthorRoles = ['Familie', 'Freund', 'Verein'];
const adminGravesPageSize = 25;

const emptyForm = (): GraveTextFormState => ({
    id: '',
    text: '',
    role: fallbackAuthorRoles[0],
    date: formatDateForInput(new Date().toISOString().slice(0, 10)),
});

export const AdminPage = () => {
    const [credentials, setCredentials] = useState('');
    const [graveSearchQuery, setGraveSearchQuery] = useState('');
    const [graves, setGraves] = useState<GraveRecord[]>([]);
    const [nextGravesOffset, setNextGravesOffset] = useState<number | null>(null);
    const [totalGraves, setTotalGraves] = useState<number | null>(null);
    const [selectedGrave, setSelectedGrave] = useState<GraveRecord | null>(null);
    const [graveTexts, setGraveTexts] = useState<GraveTextItem[]>([]);
    const [roles, setRoles] = useState<GraveTextRole[]>([]);
    const [permissions, setPermissions] = useState<AdminPermission[]>([]);
    const [importStatus, setImportStatus] = useState<DataImportStatus | null>(null);
    const [formState, setFormState] = useState<GraveTextFormState>(() => emptyForm());
    const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
    const [roleFormState, setRoleFormState] = useState({ id: '', name: '' });
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isSearchingGraves, setIsSearchingGraves] = useState(false);
    const [isLoadingMoreGraves, setIsLoadingMoreGraves] = useState(false);
    const [isLoadingTexts, setIsLoadingTexts] = useState(false);
    const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
    const [hasLoadedPermissions, setHasLoadedPermissions] = useState(false);
    const [permissionsFailed, setPermissionsFailed] = useState(false);

    const canEditGraveTexts = permissions.includes('grave_texts');
    const canManageRoles = permissions.includes('grave_text_roles');
    const canStartDataImport = permissions.includes('data_import');

    const loadGraves = useCallback(async (query: string, offset = 0) => {
        if (offset === 0) {
            setIsSearchingGraves(true);
        } else {
            setIsLoadingMoreGraves(true);
        }
        setError('');

        try {
            const page = await fetchGravesPage(offset, adminGravesPageSize, {
                query,
                searchBirthName: true,
                searchFirstName: true,
                searchLastName: true,
            });
            setGraves((currentGraves) => offset === 0 ? page.items : [...currentGraves, ...page.items]);
            setNextGravesOffset(page.nextOffset);
            setTotalGraves(page.total);
        } catch {
            setError('Grabstellen konnten nicht geladen werden.');
        } finally {
            setIsSearchingGraves(false);
            setIsLoadingMoreGraves(false);
        }
    }, []);

    const loadGraveTexts = useCallback(async (graveId: string, authorization = credentials) => {
        if (!authorization || !graveId) return;

        setIsLoadingTexts(true);
        setError('');

        try {
            const params = new URLSearchParams({ graveId });
            const result = await fetch(`${apiBaseUrl}/api/admin/grave-texts?${params.toString()}`, {
                credentials: 'include',
                headers: getAnalyticsAuthHeaders(authorization),
            });

            if (result.status === 401) {
                clearAnalyticsSession();
                setCredentials('');
                setGraveTexts([]);
                setError('Mailadresse oder Passwort ist falsch.');
                return;
            }

            if (result.status === 404) {
                setError('Der Grabtexte-Endpunkt wurde nicht gefunden. Bitte API-Server neu starten bzw. Backend-Container neu bauen.');
                setGraveTexts([]);
                return;
            }

            if (!result.ok) throw new Error(`HTTP ${result.status}`);

            const data = await result.json() as { items: GraveTextItem[] };
            setGraveTexts(data.items);
        } catch {
            setError('Grabtexte konnten nicht geladen werden.');
        } finally {
            setIsLoadingTexts(false);
        }
    }, [credentials]);

    const loadRoles = useCallback(async (authorization = credentials) => {
        if (!authorization) return;

        try {
            const result = await fetch(`${apiBaseUrl}/api/admin/grave-text-roles`, {
                credentials: 'include',
                headers: getAnalyticsAuthHeaders(authorization),
            });

            if (result.status === 401) {
                clearAnalyticsSession();
                setCredentials('');
                setRoles([]);
                setError('Mailadresse oder Passwort ist falsch.');
                return;
            }

            if (!result.ok) throw new Error(`HTTP ${result.status}`);

            const data = await result.json() as { items: GraveTextRole[] };
            setRoles(data.items);
            setFormState((state) => data.items.some((role) => role.name === state.role)
                ? state
                : { ...state, role: data.items[0]?.name ?? fallbackAuthorRoles[0] });
        } catch {
            setError('Rollen konnten nicht geladen werden.');
        }
    }, [credentials]);

    const loadCurrentUser = useCallback(async (authorization = credentials) => {
        if (!authorization) return;

        setIsLoadingPermissions(true);
        setPermissionsFailed(false);
        try {
            const result = await fetch(`${apiBaseUrl}/api/admin/me`, {
                credentials: 'include',
                headers: getAnalyticsAuthHeaders(authorization),
            });

            if (result.status === 401) {
                clearAnalyticsSession();
                setCredentials('');
                setPermissions([]);
                return;
            }

            if (result.status === 404) {
                throw new Error('Der Berechtigungs-Endpunkt wurde nicht gefunden. Bitte API-Server neu starten bzw. Backend-Container neu bauen.');
            }

            if (!result.ok) throw new Error(`HTTP ${result.status}`);

            const data = await result.json() as { permissions: AdminPermission[] };
            setPermissions(data.permissions);
        } catch (permissionsError) {
            setPermissions([]);
            setPermissionsFailed(true);
            setError(permissionsError instanceof Error ? permissionsError.message : 'Berechtigungen konnten nicht geladen werden.');
        } finally {
            setIsLoadingPermissions(false);
            setHasLoadedPermissions(true);
        }
    }, [credentials]);

    const loadImportStatus = useCallback(async (authorization = credentials) => {
        if (!authorization || !canStartDataImport) return;

        try {
            const result = await fetch(`${apiBaseUrl}/api/admin/data-import`, {
                credentials: 'include',
                headers: getAnalyticsAuthHeaders(authorization),
            });
            if (!result.ok) throw new Error(`HTTP ${result.status}`);
            setImportStatus(await result.json() as DataImportStatus);
        } catch {
            setError('Importstatus konnte nicht geladen werden.');
        }
    }, [canStartDataImport, credentials]);

    useEffect(() => {
        const timer = window.setTimeout(() => setCredentials(sessionStorage.getItem(credentialsKey) ?? '1'), 0);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!credentials) return;
        if (!hasLoadedPermissions || !canEditGraveTexts) return;

        const timer = window.setTimeout(() => void loadGraves(graveSearchQuery), 250);
        return () => window.clearTimeout(timer);
    }, [canEditGraveTexts, credentials, graveSearchQuery, hasLoadedPermissions, loadGraves]);

    useEffect(() => {
        if (!credentials) return;

        const timer = window.setTimeout(() => void loadCurrentUser(credentials), 0);
        return () => window.clearTimeout(timer);
    }, [credentials, loadCurrentUser]);

    useEffect(() => {
        if (!credentials || (!canEditGraveTexts && !canManageRoles)) return;

        const timer = window.setTimeout(() => void loadRoles(credentials), 0);
        return () => window.clearTimeout(timer);
    }, [canEditGraveTexts, canManageRoles, credentials, loadRoles]);

    useEffect(() => {
        if (!credentials || !canStartDataImport) return;

        const timer = window.setTimeout(() => void loadImportStatus(credentials), 0);
        return () => window.clearTimeout(timer);
    }, [canStartDataImport, credentials, loadImportStatus]);

    useEffect(() => {
        if (!credentials || !canStartDataImport || !importStatus?.running) return;

        const interval = window.setInterval(() => void loadImportStatus(credentials), 2500);
        return () => window.clearInterval(interval);
    }, [canStartDataImport, credentials, importStatus?.running, loadImportStatus]);

    const login = () => {
        setHasLoadedPermissions(false);
        setIsLoadingPermissions(true);
        setCredentials(sessionStorage.getItem(credentialsKey) ?? '1');
    };

    const logout = async () => {
        await logoutAdmin();
        setCredentials('');
        setGraves([]);
        setNextGravesOffset(null);
        setTotalGraves(null);
        setSelectedGrave(null);
        setGraveTexts([]);
        setRoles([]);
        setPermissions([]);
        setImportStatus(null);
        setPermissionsFailed(false);
        setIsLoadingPermissions(false);
        setHasLoadedPermissions(false);
        setFormState(emptyForm());
    };

    const selectGrave = (grave: GraveRecord) => {
        setSelectedGrave(grave);
        setFormState(emptyForm());
        setMessage('');
        setError('');
        void loadGraveTexts(grave.id);
    };

    const saveGraveText = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedGrave) return;

        setMessage('');
        setError('');

        try {
            const isoDate = parseGermanDateInput(formState.date);
            if (!isoDate) {
                setError('Bitte gib das Datum im Format TT.MM.JJJJ ein.');
                return;
            }

            const isEdit = Boolean(formState.id);
            const result = await fetch(`${apiBaseUrl}/api/admin/grave-texts${isEdit ? `/${formState.id}` : ''}`, {
                method: isEdit ? 'PUT' : 'POST',
                credentials: 'include',
                headers: {
                    ...getAnalyticsAuthHeaders(credentials),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    graveId: selectedGrave.id,
                    text: formState.text,
                    role: formState.role,
                    date: isoDate,
                }),
            });

            if (!result.ok) {
                const data = await result.json().catch(() => ({})) as { error?: string };
                throw new Error(
                    result.status === 404
                        ? 'Der Grabtexte-Endpunkt wurde nicht gefunden. Bitte API-Server neu starten bzw. Backend-Container neu bauen.'
                        : data.error ?? 'Speichern fehlgeschlagen.',
                );
            }

            setFormState(emptyForm());
            setMessage(isEdit ? 'Text gespeichert.' : 'Text hinzugefügt.');
            await loadGraveTexts(selectedGrave.id);
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Text konnte nicht gespeichert werden.');
        }
    };

    const editGraveText = (graveText: GraveTextItem) => {
        setFormState({
            id: graveText.id,
            text: graveText.text,
            role: graveText.role,
            date: formatDateForInput(graveText.date),
        });
        setMessage('');
        setError('');
    };

    const saveRole = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage('');
        setError('');

        try {
            const isEdit = Boolean(roleFormState.id);
            const result = await fetch(`${apiBaseUrl}/api/admin/grave-text-roles${isEdit ? `/${roleFormState.id}` : ''}`, {
                method: isEdit ? 'PUT' : 'POST',
                credentials: 'include',
                headers: {
                    ...getAnalyticsAuthHeaders(credentials),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: roleFormState.name }),
            });

            if (!result.ok) {
                const data = await result.json().catch(() => ({})) as { error?: string };
                throw new Error(data.error ?? 'Rolle konnte nicht gespeichert werden.');
            }

            setRoleFormState({ id: '', name: '' });
            setMessage(isEdit ? 'Rolle gespeichert.' : 'Rolle hinzugefügt.');
            await loadRoles();
            if (selectedGrave) await loadGraveTexts(selectedGrave.id);
        } catch (roleError) {
            setError(roleError instanceof Error ? roleError.message : 'Rolle konnte nicht gespeichert werden.');
        }
    };

    const editRole = (role: GraveTextRole) => {
        setRoleFormState({ id: role.id, name: role.name });
        setMessage('');
        setError('');
    };

    const deleteRole = async (role: GraveTextRole) => {
        if (!window.confirm(`Rolle „${role.name}“ wirklich löschen?`)) return;

        setMessage('');
        setError('');

        try {
            const result = await fetch(`${apiBaseUrl}/api/admin/grave-text-roles/${role.id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getAnalyticsAuthHeaders(credentials),
            });

            if (!result.ok) {
                const data = await result.json().catch(() => ({})) as { error?: string };
                throw new Error(data.error ?? 'Rolle konnte nicht gelöscht werden.');
            }

            setMessage('Rolle gelöscht.');
            await loadRoles();
        } catch (roleError) {
            setError(roleError instanceof Error ? roleError.message : 'Rolle konnte nicht gelöscht werden.');
        }
    };

    const deleteGraveText = async (graveText: GraveTextItem) => {
        if (!selectedGrave || !window.confirm('Diesen Text wirklich löschen?')) return;

        setMessage('');
        setError('');

        try {
            const result = await fetch(`${apiBaseUrl}/api/admin/grave-texts/${graveText.id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getAnalyticsAuthHeaders(credentials),
            });

            if (result.status === 404) {
                throw new Error('Der Grabtexte-Endpunkt wurde nicht gefunden. Bitte API-Server neu starten bzw. Backend-Container neu bauen.');
            }

            if (!result.ok) throw new Error(`HTTP ${result.status}`);

            if (formState.id === graveText.id) setFormState(emptyForm());
            setMessage('Text gelöscht.');
            await loadGraveTexts(selectedGrave.id);
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : 'Text konnte nicht gelöscht werden.');
        }
    };

    const startDataImport = async () => {
        if (!window.confirm('Datenimport wirklich starten? Änderungen aus den Dateien werden eingepflegt. Manuell gepflegte Grabtexte bleiben erhalten.')) return;

        setMessage('');
        setError('');

        try {
            const result = await fetch(`${apiBaseUrl}/api/admin/data-import`, {
                method: 'POST',
                credentials: 'include',
                headers: getAnalyticsAuthHeaders(credentials),
            });

            if (!result.ok) {
                const data = await result.json().catch(() => ({})) as { error?: string };
                throw new Error(data.error ?? 'Datenimport konnte nicht gestartet werden.');
            }

            setImportStatus(await result.json() as DataImportStatus);
            setMessage('Datenimport wurde gestartet.');
        } catch (importError) {
            setError(importError instanceof Error ? importError.message : 'Datenimport konnte nicht gestartet werden.');
        }
    };

    const renderEditorContent = () => selectedGrave ? (
        <>
            <div className="admin-selected-grave">
                <div>
                    <span>Ausgewählte Grabstelle</span>
                    <h2>{selectedGrave.displayLastName}, {selectedGrave.firstName}</h2>
                    <p>{selectedGrave.cemetery}</p>
                </div>
                <button
                    type="button"
                    className="admin-editor-close"
                    aria-label="Bearbeitungsfenster schließen"
                    onClick={() => {
                        setSelectedGrave(null);
                        setFormState(emptyForm());
                        setGraveTexts([]);
                    }}
                >
                    ×
                </button>
            </div>

            <form className="admin-form" onSubmit={saveGraveText}>
                <h3>{formState.id ? 'Text bearbeiten' : 'Neuen Text hinzufügen'}</h3>
                <label>
                    Verfasst von
                    <select
                        value={formState.role}
                        required
                        onChange={(event) => setFormState((state) => ({ ...state, role: event.target.value }))}
                    >
                        {(roles.length ? roles.map((role) => role.name) : fallbackAuthorRoles)
                            .map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                </label>
                <label>
                    Datum
                    <input
                        value={formState.date}
                        type="text"
                        inputMode="numeric"
                        placeholder="TT.MM.JJJJ"
                        required
                        onChange={(event) => setFormState((state) => ({ ...state, date: event.target.value }))}
                    />
                </label>
                <label className="admin-form-wide">
                    Text
                    <textarea
                        value={formState.text}
                        maxLength={5000}
                        required
                        rows={9}
                        placeholder="Text eingeben, der später auf der Grabdetailseite angezeigt wird."
                        onChange={(event) => setFormState((state) => ({ ...state, text: event.target.value }))}
                    />
                </label>
                <div className="admin-form-actions">
                    <button type="submit">{formState.id ? 'Speichern' : 'Hinzufügen'}</button>
                    {formState.id && (
                        <button type="button" className="admin-secondary" onClick={() => setFormState(emptyForm())}>
                            Abbrechen
                        </button>
                    )}
                </div>
            </form>

            <div className="admin-text-section">
                <h3>Vorhandene Texte</h3>
                {isLoadingTexts ? <p>Lade Texte …</p> : (
                    <div className="admin-text-list">
                        {graveTexts.length === 0 ? (
                            <p className="analytics-empty">Für diese Grabstelle sind noch keine Texte hinterlegt.</p>
                        ) : graveTexts.map((graveText) => (
                            <article key={graveText.id} className="admin-text-item">
                                <header>
                                    <div>
                                        <strong>{graveText.role}</strong>
                                        <span>{formatDate(graveText.date)}</span>
                                    </div>
                                </header>
                                <p>{graveText.text}</p>
                                <footer>
                                    <small>
                                        Angelegt von {graveText.createdBy}
                                        {graveText.updatedBy ? ` · geändert von ${graveText.updatedBy}` : ''}
                                    </small>
                                    <span>
                                        <button type="button" className="admin-secondary" onClick={() => editGraveText(graveText)}>Bearbeiten</button>
                                        <button type="button" className="analytics-delete" onClick={() => void deleteGraveText(graveText)}>Löschen</button>
                                    </span>
                                </footer>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </>
    ) : (
        <div className="admin-empty-selection">
            <h2>Keine Grabstelle ausgewählt</h2>
            <p>Suche links nach einer Grabstelle und wähle sie aus, um Texte zu bearbeiten.</p>
        </div>
    );

    return (
        <main className="analytics-page admin-page">
            <Seo title="Admin-Plattform" description="Geschützte Admin-Plattform für Grabtexte" path="/admin" />

            <header className="analytics-header">
                <div>
                    <p>Administration</p>
                    <h1>Admin-Plattform</h1>
                </div>
                {credentials && (
                    <div className="analytics-header-actions">
                        <nav className="analytics-main-nav" aria-label="Admin-Hauptbereiche">
                            <Link to="/admin" aria-current="page">Grabtexte</Link>
                            {permissions.includes('statistics') && <Link to="/admin/statistik">Statistik</Link>}
                            {permissions.includes('profile_management') && <Link to="/admin/profile">Profile</Link>}
                        </nav>
                        <div className="analytics-account-actions" aria-label="Konto">
                            <Link to="/admin/passwort">Passwort</Link>
                            <button type="button" onClick={() => void logout()}>Abmelden</button>
                        </div>
                    </div>
                )}
            </header>

            {!credentials ? (
                <AdminLoginForm title="Anmelden" submitLabel="Admin-Plattform öffnen" onLogin={login} />
            ) : isLoadingPermissions || !hasLoadedPermissions ? (
                <section className="admin-card admin-no-permission">
                    <h2>Berechtigungen werden geladen</h2>
                    <p>Bitte kurz warten.</p>
                </section>
            ) : permissionsFailed ? (
                <section className="admin-card admin-no-permission">
                    <h2>Berechtigungen konnten nicht geprüft werden</h2>
                    <p>Bitte API-Server neu starten bzw. Backend-Container neu bauen und danach neu anmelden.</p>
                </section>
            ) : (
                canEditGraveTexts ? <>
                    {(canManageRoles || canStartDataImport) && (
                        <section className="admin-action-bar" aria-label="Admin-Aktionen">
                            <div>
                                <strong>Werkzeuge</strong>
                                <span>Aktionen für diese Plattform</span>
                            </div>
                            <div>
                                {canManageRoles && <button type="button" className="analytics-header-link-button" onClick={() => setIsRoleDialogOpen(true)}>Rollen bearbeiten</button>}
                                {canStartDataImport && <button type="button" className="analytics-header-link-button" onClick={() => void startDataImport()}>Daten importieren</button>}
                            </div>
                        </section>
                    )}
                    <div className="admin-workspace">
                    <section className="admin-card admin-search-panel">
                        <div className="admin-panel-heading">
                            <h2>Grabstelle suchen</h2>
                            <p>Wähle ein Grab aus. Danach kannst du die dazugehörigen Texte verwalten.</p>
                        </div>
                        <label className="admin-search-field" aria-label="Grabstelle suchen">
                            <input
                                value={graveSearchQuery}
                                placeholder="Name, Geburtsname, Friedhof oder Datum"
                                onChange={(event) => setGraveSearchQuery(event.target.value)}
                            />
                        </label>

                        {isSearchingGraves ? <p>Lade Grabstellen …</p> : (
                            <div className="admin-grave-list">
                                {graves.length === 0 ? (
                                    <p className="analytics-empty">Keine Grabstellen gefunden.</p>
                                ) : (
                                    <>
                                        {graves.map((grave) => (
                                            <div key={grave.id} className="admin-grave-list-entry">
                                                <GraveCard
                                                    firstName={grave.firstName}
                                                    lastName={grave.displayLastName}
                                                    birthDate={grave.birthDate}
                                                    deathDate={grave.deathDate}
                                                    cemetery={grave.cemetery}
                                                    selected={selectedGrave?.id === grave.id}
                                                    onClick={() => selectGrave(grave)}
                                                />
                                                {selectedGrave?.id === grave.id && (
                                                    <section
                                                        className="admin-card admin-editor-panel admin-editor-panel--inline"
                                                        role="dialog"
                                                        aria-modal="true"
                                                        aria-label="Grabtexte bearbeiten"
                                                    >
                                                        {renderEditorContent()}
                                                    </section>
                                                )}
                                            </div>
                                        ))}
                                        {nextGravesOffset !== null && (
                                            <button
                                                type="button"
                                                className="admin-load-more"
                                                disabled={isLoadingMoreGraves}
                                                onClick={() => void loadGraves(graveSearchQuery, nextGravesOffset)}
                                            >
                                                {isLoadingMoreGraves ? 'Lade weitere Grabstellen …' : 'Mehr laden'}
                                            </button>
                                        )}
                                        {totalGraves !== null && (
                                            <p className="admin-grave-count">
                                                {graves.length.toLocaleString('de-DE')}
                                                {' von '}
                                                {totalGraves.toLocaleString('de-DE')} angezeigt
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </section>

                    <section className="admin-card admin-editor-panel">
                        {renderEditorContent()}
                    </section>
                    </div>
                </> : (
                    <section className="admin-card admin-no-permission">
                        <h2>Keine Berechtigung</h2>
                        <p>Dieses Profil darf keine Grabtexte bearbeiten. Bitte wende dich an ein Profil mit Profilverwaltung.</p>
                    </section>
                )
            )}

            {isRoleDialogOpen && canManageRoles && (
                <div className="admin-role-dialog-backdrop" role="presentation">
                    <section className="admin-role-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-role-dialog-title">
                        <header className="admin-role-dialog-header">
                            <h2 id="admin-role-dialog-title">Rollen bearbeiten</h2>
                            <button type="button" aria-label="Rollenfenster schließen" onClick={() => {
                                setIsRoleDialogOpen(false);
                                setRoleFormState({ id: '', name: '' });
                            }}>
                                ×
                            </button>
                        </header>

                        <form className="admin-role-form" onSubmit={saveRole}>
                            <label>
                                Rollenname
                                <input
                                    value={roleFormState.name}
                                    maxLength={120}
                                    required
                                    placeholder="z. B. Nachbarschaft"
                                    onChange={(event) => setRoleFormState((state) => ({ ...state, name: event.target.value }))}
                                />
                            </label>
                            <div className="admin-role-actions">
                                <button type="submit">{roleFormState.id ? 'Speichern' : 'Hinzufügen'}</button>
                                {roleFormState.id && (
                                    <button type="button" className="admin-secondary" onClick={() => setRoleFormState({ id: '', name: '' })}>
                                        Abbrechen
                                    </button>
                                )}
                            </div>
                        </form>

                        <div className="admin-role-list">
                            {roles.map((role) => (
                                <div key={role.id} className="admin-role-item">
                                    <span>{role.name}</span>
                                    <div>
                                        <button type="button" className="admin-secondary" onClick={() => editRole(role)}>Bearbeiten</button>
                                        <button type="button" className="analytics-delete" onClick={() => void deleteRole(role)}>Löschen</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {canStartDataImport && importStatus?.lastRun && (
                <section className="admin-import-status" aria-live="polite">
                    <strong>
                        Import: {importStatus.running ? 'läuft' : importStatus.lastRun.status === 'succeeded' ? 'erfolgreich' : 'fehlgeschlagen'}
                    </strong>
                    <span>
                        Gestartet von {importStatus.lastRun.startedBy} am {new Date(importStatus.lastRun.startedAt).toLocaleString('de-DE')}
                    </span>
                    {importStatus.lastRun.finishedAt && (
                        <span>Beendet am {new Date(importStatus.lastRun.finishedAt).toLocaleString('de-DE')}</span>
                    )}
                    {importStatus.lastRun.output && <pre>{importStatus.lastRun.output}</pre>}
                </section>
            )}

            {message && <p className="analytics-user-message admin-message">{message}</p>}
            {error && <p className="analytics-error">{error}</p>}
        </main>
    );
};

function formatDateForInput(date: string) {
    if (!date) return '';

    const isoMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;

    return date;
}

function parseGermanDateInput(date: string) {
    const trimmedDate = date.trim();
    const germanMatch = trimmedDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    const isoMatch = trimmedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (germanMatch) {
        return `${germanMatch[3]}-${germanMatch[2]}-${germanMatch[1]}`;
    }

    if (isoMatch) {
        return trimmedDate;
    }

    return '';
}

const formatDate = (date: string) => formatDateForInput(date);
