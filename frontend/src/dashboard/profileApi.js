const SESSION_STORAGE_KEY = "adaptive_dashboard_session_token";

async function request(path, { method = "GET", body, token } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return data;
}

export function getStoredSessionToken() {
    try {
        return localStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
        return null;
    }
}

export function clearStoredSessionToken() {
    try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
        // Ignore localStorage access issues in non-browser environments.
    }
}

function setStoredSessionToken(token) {
    try {
        localStorage.setItem(SESSION_STORAGE_KEY, token);
    } catch {
        // Ignore localStorage access issues in non-browser environments.
    }
}

export function fetchProfiles() {
    return request("/api/profiles");
}

export async function loginProfile(name) {
    const data = await request("/api/login", {
        method: "POST",
        body: { name },
    });
    setStoredSessionToken(data.session.token);
    return data;
}

export async function restoreSession(token = getStoredSessionToken()) {
    if (!token) return null;
    return request("/api/session", { token });
}

export async function logoutProfile(token = getStoredSessionToken()) {
    if (!token) return;
    await request("/api/logout", { method: "POST", token });
    clearStoredSessionToken();
}

export async function saveProfileState(state, token = getStoredSessionToken()) {
    if (!token) throw new Error("Not logged in");
    return request("/api/profile", {
        method: "PUT",
        token,
        body: { state },
    });
}

export async function clearProfile(token = getStoredSessionToken()) {
    if (!token) throw new Error("Not logged in");
    const data = await request("/api/profile", {
        method: "DELETE",
        token,
    });
    clearStoredSessionToken();
    return data;
}
