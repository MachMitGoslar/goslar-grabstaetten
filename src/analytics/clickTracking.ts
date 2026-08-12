const apiBaseUrl = import.meta.env.VITE_API_URL ?? '';
let lastPageView = { path: '', recordedAt: 0 };
let lastSearchStartedAt = 0;

export type AnalyticsEventType = 'button_click' | 'page_view' | 'search_started';

export const recordAnalyticsEvent = (eventType: AnalyticsEventType, buttonKey?: string) => {
    if (window.location.pathname.startsWith('/admin/')) return;

    if (eventType === 'page_view') {
        const now = Date.now();
        if (lastPageView.path === window.location.pathname && now - lastPageView.recordedAt < 500) return;
        lastPageView = { path: window.location.pathname, recordedAt: now };
    }

    if (eventType === 'search_started') {
        const now = Date.now();
        if (now - lastSearchStartedAt < 500) return;
        lastSearchStartedAt = now;
    }

    const payload = JSON.stringify({
        path: window.location.pathname,
        eventType,
        buttonKey,
    });
    const endpoint = `${apiBaseUrl}/api/analytics/click`;

    if (navigator.sendBeacon) {
        const body = new Blob([payload], { type: 'application/json' });
        if (navigator.sendBeacon(endpoint, body)) return;
    }

    void fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true,
    }).catch(() => undefined);
};

const getFallbackKey = (button: Element) => {
    const tag = button.tagName.toLowerCase();
    const classes = [...button.classList].filter((name) => !name.includes('--')).slice(0, 2);
    const siblings = button.parentElement
        ? [...button.parentElement.children].filter((element) => element.tagName === button.tagName)
        : [];
    const position = siblings.length > 1 ? `:${siblings.indexOf(button) + 1}` : '';

    return `${tag}${classes.length ? `.${classes.join('.')}` : ''}${position}`;
};

const getButtonKey = (button: Element) => {
    const explicitKey = button.getAttribute('data-analytics-id')
        ?? button.id
        ?? button.getAttribute('aria-label')
        ?? button.getAttribute('title')
        ?? button.getAttribute('name');
    const fallbackKey = button.textContent?.replace(/\s+/g, ' ').trim();

    return (explicitKey || fallbackKey || getFallbackKey(button)).slice(0, 200);
};

const recordClick = (event: MouseEvent) => {
    if (window.location.pathname.startsWith('/admin/')) {
        return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('button, ion-button, ion-back-button, ion-fab-button')
        ?? target?.closest('[role="button"]');

    if (!button) {
        return;
    }

    recordAnalyticsEvent('button_click', getButtonKey(button));
};

export const startClickTracking = () => {
    document.addEventListener('click', recordClick, { capture: true });
};
