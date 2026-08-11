const apiBaseUrl = import.meta.env.VITE_API_URL ?? '';

const recordClick = () => {
    const payload = JSON.stringify({ path: window.location.pathname });
    const endpoint = `${apiBaseUrl}/api/analytics/click`;

    if (navigator.sendBeacon) {
        const body = new Blob([payload], { type: 'application/json' });

        if (navigator.sendBeacon(endpoint, body)) {
            return;
        }
    }

    void fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
    }).catch(() => undefined);
};

export const startClickTracking = () => {
    document.addEventListener('click', recordClick, { capture: true });
};
