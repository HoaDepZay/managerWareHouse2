document.addEventListener('DOMContentLoaded', () => {
    checkAuthAndRedirect('staff', 'login_register.html');
    displayWelcomeMessage();
    document.getElementById('logout-button').addEventListener('click', logout);

    const currentUser = getUserFromToken();
    const permissionStatus = document.getElementById('permission-status');

    if (currentUser) {
        permissionStatus.textContent = `Your current permissions: ${currentUser.permissions && currentUser.permissions.length > 0 ? currentUser.permissions.join(', ') : 'None'}.`;

        // Hide/show navigation links based on permissions
        const navProducts = document.getElementById('nav-products');
        const navWarehouses = document.getElementById('nav-warehouses');
        const navImportBills = document.getElementById('nav-import-bills');
        const navExportBills = document.getElementById('nav-export-bills');
        const navCustomers = document.getElementById('nav-customers');

        // All staff can view products and warehouses
        navProducts.style.display = 'list-item';
        navWarehouses.style.display = 'list-item';

        if (hasPermission('createImportBill') || hasPermission('viewImportBills') || hasPermission('updateImportBill') || hasPermission('deleteImportBill')) {
            navImportBills.style.display = 'list-item';
        } else {
            navImportBills.style.display = 'none';
        }

        if (hasPermission('createExportBill') || hasPermission('viewExportBills') || hasPermission('updateExportBill') || hasPermission('deleteExportBill')) {
            navExportBills.style.display = 'list-item';
        } else {
            navExportBills.style.display = 'none';
        }

        if (hasPermission('viewCustomers')) {
            navCustomers.style.display = 'list-item';
        } else {
            navCustomers.style.display = 'none';
        }

    } else {
        permissionStatus.textContent = 'Unable to load user permissions.';
    }
});