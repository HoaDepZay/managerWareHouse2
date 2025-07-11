document.addEventListener('DOMContentLoaded', async () => {
    checkAuthAndRedirect(['admin', 'staff', 'customer'], '/index/login_register.html'); // Sửa redirectUrl
    displayWelcomeMessage();
    document.getElementById('logout-button').addEventListener('click', logout);

    const currentUser = getUserFromToken();
    const isAdmin = currentUser && currentUser.role === 'admin';

    if (isAdmin) {
        document.getElementById('admin-dashboard-link').style.display = 'block';
    } else if (currentUser && currentUser.role === 'staff') {
        document.getElementById('staff-dashboard-link').style.display = 'block';
    }

    const productsTableBody = document.querySelector('#products-table tbody');
    const productMessage = document.getElementById('product-message');
    const searchInput = document.getElementById('product-search-input');
    const searchButton = document.getElementById('product-search-button');

    let allProductsInWarehouses = [];

    const fetchAllProductsInWarehouses = async () => {
        allProductsInWarehouses = [];
        productMessage.textContent = 'Đang tải sản phẩm từ các kho...';
        try {
            const warehouses = await getAllWarehouses();

            if (warehouses.length === 0) {
                productMessage.textContent = 'Không có kho nào được tìm thấy.';
                return [];
            }

            warehouses.forEach(warehouse => {
                if (warehouse.products && warehouse.products.length > 0) {
                    warehouse.products.forEach(product => {
                        allProductsInWarehouses.push({
                            ...product,
                            warehouseName: warehouse.name,
                            warehouseId: warehouse._id
                        });
                    });
                }
            });

            if (allProductsInWarehouses.length === 0) {
                productMessage.textContent = 'Không có sản phẩm nào trong tất cả các kho.';
            } else {
                productMessage.textContent = '';
            }

            return allProductsInWarehouses;

        } catch (error) {
            productMessage.textContent = `Lỗi khi tải sản phẩm từ các kho: ${error.message}`;
            console.error('Lỗi khi tải sản phẩm từ các kho:', error);
            return [];
        }
    };

    const renderProducts = (productsToDisplay) => {
        productsTableBody.innerHTML = '';
        if (productsToDisplay.length === 0) {
            productMessage.textContent = 'Không tìm thấy sản phẩm nào phù hợp.';
            return;
        }

        productsToDisplay.forEach(product => {
            const row = productsTableBody.insertRow();
            row.insertCell().textContent = product.name;
            row.insertCell().textContent = product.warehouseName || 'N/A';
            row.insertCell().textContent = product.codeImportBill || 'N/A';
            row.insertCell().textContent = product.type || 'N/A';
            row.insertCell().textContent = product.quantity;
            row.insertCell().textContent = formatCurrencyVND(product.price); // Giá bán mặc định
            row.insertCell().textContent = formatCurrencyVND(product.importPrice);
            row.insertCell().textContent = formatCurrencyVND(product.exportPrice);
            row.insertCell().textContent = product.description || 'N/A';
        });
    };

    await fetchAllProductsInWarehouses();
    renderProducts(allProductsInWarehouses);

    searchButton.addEventListener('click', () => {
        const query = searchInput.value.toLowerCase().trim();
        if (query === '') {
            renderProducts(allProductsInWarehouses);
            return;
        }

        const filteredProducts = allProductsInWarehouses.filter(product =>
            product.name.toLowerCase().includes(query) ||
            (product.type && product.type.toLowerCase().includes(query)) ||
            (product.codeImportBill && product.codeImportBill.toLowerCase().includes(query)) ||
            (product.warehouseName && product.warehouseName.toLowerCase().includes(query))
        );
        renderProducts(filteredProducts);
        if (filteredProducts.length === 0) {
            productMessage.textContent = 'Không tìm thấy sản phẩm nào khớp với từ khóa tìm kiếm.';
        } else {
            productMessage.textContent = '';
        }
    });

    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            searchButton.click();
        }
    });
});