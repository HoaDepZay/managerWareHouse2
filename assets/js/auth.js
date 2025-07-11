function getUserFromToken() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload; // Contains userId, username, role, approved, permissions
        } catch (e) {
            console.error('Failed to decode token:', e);
            return null;
        }
    }
    return null;
}

// Đã sửa đường dẫn redirect
function checkAuthAndRedirect(requiredRoles = [], redirectUrl = '../index/login_register.html') {
    const user = getUserFromToken();

    if (!user) {
        alert('You need to be logged in to access this page.');
        window.location.href = redirectUrl;
        return false;
    }

    // Check if approved (if it's a staff/admin account)
    // Customers might not need approval check
    if ((user.role === 'staff' || user.role === 'admin') && !user.approved) {
        alert('Your account is awaiting admin approval.');
        localStorage.removeItem('token'); // Clear token if not approved
        window.location.href = redirectUrl;
        return false;
    }

    // Check role if requiredRoles is provided
    if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
        alert(`Access denied. You need one of these roles: ${requiredRoles.join(', ')}.`);
        window.location.href = redirectUrl;
        return false;
    }
    return true;
}

function displayWelcomeMessage() {
    const user = getUserFromToken();
    const welcomeSpan = document.getElementById('welcome-message');
    if (user && welcomeSpan) {
        welcomeSpan.textContent = `Welcome, ${user.username || user.email}! (${user.role})`;
    }
}

function logout() {
    localStorage.removeItem('token');
    alert('Logged out successfully.');
    // Đã sửa đường dẫn logout
    window.location.href = '../index/login_register.html';
}

// Helper to check if user has a specific permission
function hasPermission(permission) {
    const user = getUserFromToken();
    if (!user) return false;
    // Admins have all permissions
    if (user.role === 'admin') return true;
    // Check if staff and has the specific permission
    return user.role === 'staff' && user.permissions && user.permissions.includes(permission);
}
// Helper function for currency formatting VND
function formatCurrencyVND(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) {
        return 'N/A';
    }
    // Using Intl.NumberFormat for robust localization and currency formatting
    // Vietnamese Dong typically doesn't use decimal places for whole numbers.
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0, // Không hiển thị số thập phân
        maximumFractionDigits: 0  // Không hiển thị số thập phân
    }).format(amount);
}