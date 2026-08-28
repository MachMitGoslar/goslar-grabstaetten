import { type FormEvent, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
    analyticsCredentialsKey,
    changeAdminPassword,
    logoutAdmin,
} from '../analytics/adminAuth.ts';
import { Seo } from '../components/Seo.tsx';
import './Analytics.css';

export const AdminPasswordPage = () => {
    const [credentials, setCredentials] = useState('');
    const [hasCheckedCredentials, setHasCheckedCredentials] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setCredentials(sessionStorage.getItem(analyticsCredentialsKey) ?? '1');
            setHasCheckedCredentials(true);
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    const changePassword = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage('');
        setError('');

        const form = event.currentTarget;
        const formData = new FormData(form);
        const currentPassword = String(formData.get('currentPassword'));
        const newPassword = String(formData.get('newPassword'));

        if (newPassword !== String(formData.get('newPasswordRepeat'))) {
            setError('Die neuen Passwörter stimmen nicht überein.');
            return;
        }

        try {
            await changeAdminPassword(credentials, currentPassword, newPassword);
            form.reset();
            setMessage('Passwort wurde geändert.');
        } catch (changeError) {
            setError(changeError instanceof Error ? changeError.message : 'Passwort konnte nicht geändert werden.');
        }
    };

    const logout = async () => {
        await logoutAdmin();
        setCredentials('');
    };

    if (!hasCheckedCredentials) return null;
    if (!credentials) return <Navigate to="/admin" replace />;

    return (
        <main className="analytics-page">
            <Seo title="Admin-Passwort ändern" description="Passwort für Admin-Profil ändern" path="/admin/passwort" />
            <header className="analytics-header">
                <div><p>Administration</p><h1>Passwort ändern</h1></div>
                <div className="analytics-header-actions">
                    <nav className="analytics-main-nav" aria-label="Admin-Hauptbereiche">
                        <Link to="/admin">Grabtexte</Link>
                        <Link to="/admin/statistik">Statistik</Link>
                        <Link to="/admin/profile">Profile</Link>
                    </nav>
                    <div className="analytics-account-actions" aria-label="Konto">
                        <Link to="/admin/passwort" aria-current="page">Passwort</Link>
                        <button type="button" onClick={() => void logout()}>Abmelden</button>
                    </div>
                </div>
            </header>

            <form key="admin-password-change-form" className="analytics-login" onSubmit={(event) => void changePassword(event)}>
                <h2>Neues Passwort setzen</h2>
                <p>Gib dein aktuelles Passwort ein und lege danach ein neues Passwort fest.</p>
                <label>Aktuelles Passwort<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
                <label>Neues Passwort<input name="newPassword" type="password" minLength={12} maxLength={256} autoComplete="new-password" defaultValue="" required /></label>
                <label>Neues Passwort wiederholen<input name="newPasswordRepeat" type="password" minLength={12} maxLength={256} autoComplete="new-password" defaultValue="" required /></label>
                <button type="submit">Passwort ändern</button>
                {message && <p className="analytics-user-message">{message}</p>}
                {error && <p className="analytics-error analytics-error--inline">{error}</p>}
            </form>
        </main>
    );
};
