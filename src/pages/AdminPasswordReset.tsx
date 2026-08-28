import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    completeAdminResetPassword,
    verifyAdminResetCode,
} from '../analytics/adminAuth.ts';
import { Seo } from '../components/Seo.tsx';
import './Analytics.css';

export const AdminPasswordResetPage = () => {
    const navigate = useNavigate();
    const [verifiedCode, setVerifiedCode] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const getResetToken = () => new URLSearchParams(window.location.search).get('token')?.trim() ?? '';

    const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage('');
        setError('');
        const form = new FormData(event.currentTarget);
        const code = String(form.get('code'));
        const resetToken = getResetToken();

        if (!resetToken) {
            setError('Der Reset-Link ist ungültig oder unvollständig.');
            return;
        }

        try {
            const result = await verifyAdminResetCode(resetToken, code);
            setVerifiedCode(code);
            setMessage(result);
        } catch (verifyError) {
            setError(verifyError instanceof Error ? verifyError.message : 'Code konnte nicht geprüft werden.');
        }
    };

    const setPassword = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage('');
        setError('');
        const form = new FormData(event.currentTarget);
        const password = String(form.get('password'));
        const resetToken = getResetToken();

        if (password !== String(form.get('passwordRepeat'))) {
            setError('Die Passwörter stimmen nicht überein.');
            return;
        }
        if (!resetToken) {
            setError('Der Reset-Link ist ungültig oder unvollständig.');
            return;
        }

        try {
            await completeAdminResetPassword(resetToken, verifiedCode, password);
            setVerifiedCode('');
            navigate('/admin', { replace: true });
        } catch (setupError) {
            setError(setupError instanceof Error ? setupError.message : 'Passwort konnte nicht gesetzt werden.');
        }
    };

    return (
        <main className="analytics-page">
            <Seo title="Admin-Passwort zurücksetzen" description="Admin-Passwort per Einmalcode zurücksetzen" path="/admin/passwort-zuruecksetzen" />
            <header className="analytics-header">
                <div><p>Administration</p><h1>Passwort zurücksetzen</h1></div>
                <div className="analytics-header-actions"><Link to="/admin">Zur Anmeldung</Link></div>
            </header>

            {!verifiedCode ? (
                <form key="reset-code-form" className="analytics-login" onSubmit={(event) => void verifyCode(event)}>
                    <h2>Code eingeben</h2>
                    <p>Gib den Code aus der Mail ein. Erst nach erfolgreicher Prüfung kannst du ein neues Passwort festlegen.</p>
                    <label>Code<input key="reset-code-input" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required /></label>
                    <button type="submit">Code prüfen</button>
                    {message && <p className="analytics-user-message">{message}</p>}
                    {error && <p className="analytics-error analytics-error--inline">{error}</p>}
                </form>
            ) : (
                <form key="reset-password-form" className="analytics-login" onSubmit={(event) => void setPassword(event)}>
                    <h2>Passwort festlegen</h2>
                    <p>Der Code wurde bestätigt. Lege jetzt dein neues Passwort fest.</p>
                    <label>Neues Passwort<input key="reset-password-input" name="password" type="password" minLength={12} maxLength={256} autoComplete="new-password" defaultValue="" required /></label>
                    <label>Passwort wiederholen<input key="reset-password-repeat-input" name="passwordRepeat" type="password" minLength={12} maxLength={256} autoComplete="new-password" defaultValue="" required /></label>
                    <button type="submit">Passwort speichern</button>
                    {message && <p className="analytics-user-message">{message}</p>}
                    {error && <p className="analytics-error analytics-error--inline">{error}</p>}
                </form>
            )}
        </main>
    );
};
