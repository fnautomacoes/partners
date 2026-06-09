/**
 * API request wrapper with 401 interceptor for auto-refresh
 */
async function apiRequest(url, options = {}) {
    const defaultOptions = {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    };

    const mergedOptions = { ...defaultOptions, ...options, headers: { ...defaultOptions.headers, ...options.headers } };

    let response = await fetch(url, mergedOptions);

    if (response.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/refresh')) {
        const refreshed = await refreshToken();
        if (refreshed) {
            response = await fetch(url, mergedOptions);
        } else {
            handleLogout();
            throw new Error('Session expired');
        }
    }

    return response.json();
}

/**
 * Attempt to refresh the access token
 */
async function refreshToken() {
    try {
        const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                sessionStorage.setItem('user', JSON.stringify(data.data));
                return true;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

/**
 * Clear session and redirect to login
 */
function handleLogout() {
    sessionStorage.removeItem('user');
    window.location.href = '/login.html';
}

/**
 * Get current user from sessionStorage
 */
function getCurrentUser() {
    const userStr = sessionStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

/**
 * Check authentication and redirect if needed
 */
async function checkAuth(requiredRole = null) {
    let user = getCurrentUser();

    if (!user) {
        try {
            const response = await fetch('/api/auth/me', { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    user = data.data;
                    sessionStorage.setItem('user', JSON.stringify(user));
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    if (!user) {
        window.location.href = '/login.html';
        return null;
    }

    if (requiredRole && user.role !== requiredRole) {
        const redirect = user.role === 'SUPERADMIN' ? '/superadmin.html' : '/partner.html';
        window.location.href = redirect;
        return null;
    }

    return user;
}

/**
 * Logout
 */
async function logout() {
    try {
        await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (e) {
        // Ignore errors
    }
    handleLogout();
}
