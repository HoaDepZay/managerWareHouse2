const API_BASE_URL = 'http://localhost:3004'; // Adjust if your backend runs on a different port/host

async function callApi(endpoint, method = 'GET', data = null, needsAuth = true) {
    const headers = {
        'Content-Type': 'application/json',
    };

    if (needsAuth) {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('No authentication token found. Please log in.');
        }
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        method,
        headers,
    };

    if (data) {
        config.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        const responseData = await response.json();

        if (!response.ok) {
            // Include backend error message if available
            throw new Error(responseData.error || 'API request failed');
        }
        return responseData;
    } catch (error) {
        console.error(`Error calling API ${endpoint}:`, error);
        throw error; // Re-throw to be handled by the caller
    }
}

// --- Auth APIs ---
async function registerUser(userData) {
    return callApi('/register', 'POST', userData, false); // No auth needed for registration
}

async function loginUser(username, password) {
    const response = await callApi('/login', 'POST', { username, password }, false);
    if (response.token) {
        localStorage.setItem('token', response.token);
    }
    return response;
}

async function sendForgotPasswordOTP(email) {
    return callApi('/forgot-password', 'POST', { email }, false);
}

async function resetPassword(email, otp, newPassword) {
    return callApi('/reset-password', 'POST', { email, otp, newPassword }, false);
}

async function verifyRegistrationOTP(gmail, otp) {
    return callApi('/register/verify', 'POST', { gmail, otp }, false);
}

// --- Admin/Staff Specific APIs ---
async function getPendingApprovals() {
    return callApi('/pending-approvals');
}

async function assignStaffPermissions(userId, permissions) {
    return callApi(`/admin/assign-permissions/${userId}`, 'POST', { permissions });
}

// --- Product APIs ---
async function getAllProducts() {
    return callApi('/products');
}

async function createProduct(productData) {
    return callApi('/products', 'POST', productData);
}

async function updateProduct(id, productData) {
    return callApi(`/products/${id}`, 'PUT', productData);
}

async function deleteProduct(id) {
    return callApi(`/products/${id}`, 'DELETE');
}

async function searchProducts(query) {
    return callApi(`/products/search?q=${encodeURIComponent(query)}`);
}

// --- Warehouse APIs ---
async function getAllWarehouses() {
    return callApi('/warehouses');
}

async function getWarehouseById(id) {
    return callApi(`/warehouses/${id}`);
}

async function createWarehouse(warehouseData) {
    return callApi('/warehouses', 'POST', warehouseData);
}

async function updateWarehouse(id, warehouseData) {
    return callApi(`/warehouses/${id}`, 'PUT', warehouseData);
}

async function deleteWarehouse(id) {
    return callApi(`/warehouses/${id}`, 'DELETE');
}

// --- Import Bill APIs ---
async function getAllImportBills() {
    return callApi('/importbills');
}

async function getImportBillById(id) {
    return callApi(`/importbills/${id}`);
}

async function createImportBill(billData) {
    return callApi('/importbills', 'POST', billData);
}

async function updateImportBill(id, billData) {
    return callApi(`/importbills/${id}`, 'PUT', billData);
}

async function deleteImportBill(id) {
    return callApi(`/importbills/${id}`, 'DELETE');
}

// --- Export Bill APIs ---
async function getAllExportBills() {
    return callApi('/exportbills');
}

async function getExportBillById(id) {
    return callApi(`/exportbills/${id}`);
}

async function createExportBill(billData) {
    return callApi('/exportbills', 'POST', billData);
}

async function updateExportBill(id, billData) {
    return callApi(`/exportbills/${id}`, 'PUT', billData);
}

async function deleteExportBill(id) {
    return callApi(`/exportbills/${id}`, 'DELETE');
}

// --- Customer APIs ---
async function getAllCustomers() {
    return callApi('/api/customers');
}

async function getCustomerById(id) {
    return callApi(`/customers/${id}`);
}

// NOTE: Customer register/login APIs seem to use the User model in backend
// and might be deprecated/re-purposed based on your new customer schema.
// I'll keep the backend calls but note the frontend might not use them directly for customers
// if customer creation is only through export bills.
async function registerCustomer(customerData) {
    return callApi('/api/customers/register', 'POST', customerData, false); // Assuming no auth needed for customer self-reg
}

async function loginCustomer(email, password) {
    return callApi('/api/customers/login', 'POST', { email, password }, false);
}