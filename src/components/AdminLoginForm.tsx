import { type FormEvent, useState } from 'react';
import { loginAdmin } from '../analytics/adminAuth.ts';

type LoginMode = 'login' | 'forgot-password';

type AdminLoginFormProps = {
    title: string;
    submitLabel: string;
    onLogin: () => void;
};

export const AdminLoginForm = ({ title, submitLabel, onLogin }: AdminLoginFormProps) => {
    const [mode, setMode] = useState<LoginMode>('login');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const login = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage('');
        setError('');
        const form = new FormData(event.currentTarget);
        try {
            await loginAdmin(String(form.get('username')), String(form.get('password')));
            onLogin();
        } catch (loginError) {
            setError(loginError instanceof Error ? loginError.message : 'Anmeldung fehlgeschlagen.');
        }
    };

    if (mode === 'forgot-password') {
        return (
            <section className="analytics-login">
                <h2>Passwort vergessen</h2>
                <p>Bitte kontaktiere einen Administrator. Der Administrator kann in der Profilverwaltung einen neuen Zugangscode für dich erstellen.</p>
                <button type="button" className="analytics-link-button" onClick={() => setMode('login')}>Zurück zur Anmeldung</button>
                {message && <p className="analytics-user-message">{message}</p>}
                {error && <p className="analytics-error analytics-error--inline">{error}</p>}
            </section>
        );
    }

    return (
        <form className="analytics-login" onSubmit={(event) => void login(event)}>
            <h2>{title}</h2>
            <label>Nutzername<input name="username" type="text" autoComplete="username" required /></label>
            <label>Passwort<input name="password" type="password" autoComplete="current-password" required /></label>
            <button type="submit">{submitLabel}</button>
            <button type="button" className="analytics-link-button" onClick={() => setMode('forgot-password')}>Passwort vergessen?</button>
            {message && <p className="analytics-user-message">{message}</p>}
            {error && <p className="analytics-error analytics-error--inline">{error}</p>}
        </form>
    );
};
