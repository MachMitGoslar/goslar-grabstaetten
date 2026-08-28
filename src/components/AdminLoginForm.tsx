import { type FormEvent, useState } from 'react';
import {
    loginAdmin,
    requestAdminPasswordCode,
} from '../analytics/adminAuth.ts';

type LoginMode = 'login' | 'request-code';

type AdminLoginFormProps = {
    title: string;
    submitLabel: string;
    onLogin: () => void;
};

export const AdminLoginForm = ({ title, submitLabel, onLogin }: AdminLoginFormProps) => {
    const [mode, setMode] = useState<LoginMode>('login');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const login = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage('');
        setError('');
        const form = new FormData(event.currentTarget);
        try {
            await loginAdmin(String(form.get('email')), String(form.get('password')));
            onLogin();
        } catch (loginError) {
            setError(loginError instanceof Error ? loginError.message : 'Anmeldung fehlgeschlagen.');
        }
    };

    const requestCode = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage('');
        setError('');
        const form = new FormData(event.currentTarget);
        const requestedEmail = String(form.get('email'));

        try {
            const result = await requestAdminPasswordCode(requestedEmail, 'reset');
            setEmail(requestedEmail);
            setMessage(`${result} Öffne den Link aus der Mail und gib dort den Code ein.`);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Code konnte nicht angefordert werden.');
        }
    };

    if (mode === 'request-code') {
        return (
            <form className="analytics-login" onSubmit={(event) => void requestCode(event)}>
                <h2>Passwort vergessen</h2>
                <p>Gib deine Mailadresse ein. Wenn ein Profil existiert, erhältst du einen Code.</p>
                <label>Mailadresse<input name="email" type="email" autoComplete="email" defaultValue={email} required /></label>
                <button type="submit">Code anfordern</button>
                <button type="button" className="analytics-link-button" onClick={() => setMode('login')}>Zurück zur Anmeldung</button>
                {message && <p className="analytics-user-message">{message}</p>}
                {error && <p className="analytics-error analytics-error--inline">{error}</p>}
            </form>
        );
    }

    return (
        <form className="analytics-login" onSubmit={(event) => void login(event)}>
            <h2>{title}</h2>
            <label>Mailadresse<input name="email" type="text" autoComplete="username" defaultValue={email} required /></label>
            <label>Passwort<input name="password" type="password" autoComplete="current-password" required /></label>
            <button type="submit">{submitLabel}</button>
            <button type="button" className="analytics-link-button" onClick={() => setMode('request-code')}>Passwort vergessen?</button>
            {message && <p className="analytics-user-message">{message}</p>}
            {error && <p className="analytics-error analytics-error--inline">{error}</p>}
        </form>
    );
};
