document.addEventListener('DOMContentLoaded', async () => {
    checkAuthAndRedirect(['admin', 'staff'], '/index/login_register.html');
    displayWelcomeMessage();
    document.getElementById('logout-button').addEventListener('click', logout);

    const currentUser = getUserFromToken();
    const isAdmin = currentUser && currentUser.role === 'admin';

    const openAddWarehouseModalBtn = document.getElementById('open-add-warehouse-modal');
    const addWarehouseModal = document.getElementById('add-warehouse-modal');
    const addWarehouseFormModal = document.getElementById('add-warehouse-form-modal');
    const viewWarehouseDetailsModal = document.getElementById('view-warehouse-details-modal');
    const closeButtons = document.querySelectorAll('.modal .close-button');
    const warehousesTableBody = document.querySelector('#warehouses-table tbody');
    const warehouseMessage = document.getElementById('warehouse-message');

    const warehouseDetailName = document.getElementById('warehouse-detail-name');
    const warehouseDetailLocation = document.getElementById('warehouse-detail-location');
    const warehouseDetailManager = document.getElementById('warehouse-detail-manager');
    const warehouseDetailNote = document.getElementById('warehouse-detail-note');
    const warehouseDetailProductsList = document.getElementById('warehouse-detail-products'); // Đổi tên biến để thống nhất
    const noProductsMessage = document.getElementById('no-products-message');

    // Chart elements for Warehouse Product Chart
    const warehouseProductChartTypeSelect = document.getElementById('warehouse-product-chart-type');
    const warehouseProductChartCanvas = document.getElementById('warehouseProductChart');
    const warehouseChartStatus = document.getElementById('warehouse-chart-status');
    let warehouseProductChartInstance = null;

    // Search elements inside modal
    const modalProductSearchInput = document.getElementById('modal-product-search-input');
    const modalProductSearchButton = document.getElementById('modal-product-search-button');

    let allWarehouses = []; // Cache all warehouses for overall product chart
    let currentWarehouseProducts = []; // Cache products of the currently viewed warehouse

    if (isAdmin || hasPermission('createWarehouse')) {
        openAddWarehouseModalBtn.style.display = 'block';
    } else {
        openAddWarehouseModalBtn.style.display = 'none';
    }

    if (isAdmin) {
        document.getElementById('admin-dashboard-link').style.display = 'block';
    } else if (currentUser && currentUser.role === 'staff') {
        document.getElementById('staff-dashboard-link').style.display = 'block';
    }

    openAddWarehouseModalBtn.addEventListener('click', () => {
        addWarehouseModal.style.display = 'flex';
        addWarehouseFormModal.style.display = 'block';
        addWarehouseFormModal.reset(); // Reset form when opening
    });

    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            addWarehouseModal.style.display = 'none';
            viewWarehouseDetailsModal.style.display = 'none';
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target == addWarehouseModal) {
            addWarehouseModal.style.display = 'none';
        }
        if (event.target == viewWarehouseDetailsModal) {
            viewWarehouseDetailsModal.style.display = 'none';
        }
    });

    addWarehouseFormModal.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = addWarehouseFormModal['add-warehouse-name'].value;
        const location = addWarehouseFormModal['add-warehouse-location'].value;
        const manager = addWarehouseFormModal['add-warehouse-manager-id'].value || null;
        const note = addWarehouseFormModal['add-warehouse-note'].value;

        try {
            await createWarehouse({ name, location, manager, note });
            alert('Kho đã được thêm thành công!');
            addWarehouseFormModal.reset();
            addWarehouseModal.style.display = 'none';
            renderWarehouses(); // Refresh warehouse list and chart
        } catch (error) {
            alert('Lỗi khi thêm kho: ' + error.message);
        }
    });

    const renderWarehouses = async () => {
        warehousesTableBody.innerHTML = '';
        try {
            allWarehouses = await getAllWarehouses(); // Fetch all and cache for chart

            if (allWarehouses.length === 0) {
                warehouseMessage.textContent = 'Chưa có kho nào được tìm thấy.';
                if (warehouseProductChartInstance) warehouseProductChartInstance.destroy();
                warehouseChartStatus.textContent = 'Không có dữ liệu kho để tạo biểu đồ.';
                return;
            }

            allWarehouses.forEach(warehouse => {
                const row = warehousesTableBody.insertRow();
                row.insertCell().textContent = warehouse.name;
                row.insertCell().textContent = warehouse.location;
                row.insertCell().textContent = warehouse.manager ? warehouse.manager.username : 'N/A';
                row.insertCell().textContent = warehouse.products ? warehouse.products.length : 0;
                row.insertCell().textContent = warehouse.note || 'N/A';

                const actionsCell = row.insertCell();
                const viewDetailsBtn = document.createElement('button');
                viewDetailsBtn.textContent = 'Xem chi tiết';
                viewDetailsBtn.addEventListener('click', () => showWarehouseDetails(warehouse));
                actionsCell.appendChild(viewDetailsBtn);
            });
            updateWarehouseProductChart(); // Update chart after data loaded
        } catch (error) {
            warehouseMessage.textContent = `Lỗi khi tải danh sách kho: ${error.message}`;
            console.error('Lỗi khi tải danh sách kho:', error);
            if (warehouseProductChartInstance) warehouseProductChartInstance.destroy();
            warehouseChartStatus.textContent = 'Lỗi khi tải dữ liệu cho biểu đồ.';
        }
    };

    const showWarehouseDetails = async (warehouse) => {
        warehouseDetailName.textContent = warehouse.name;
        warehouseDetailLocation.textContent = warehouse.location;
        warehouseDetailManager.textContent = warehouse.manager ? warehouse.manager.username : 'N/A';
        warehouseDetailNote.textContent = warehouse.note || 'N/A';
        
        currentWarehouseProducts = warehouse.products || []; // Cache products of this specific warehouse
        renderWarehouseProductsInModal(currentWarehouseProducts); // Initial render with all products
        
        modalProductSearchInput.value = ''; // Clear search input when opening modal
        viewWarehouseDetailsModal.style.display = 'flex'; // Show modal
    };

    // New function to render products within the modal
    const renderWarehouseProductsInModal = (productsToDisplay) => {
        warehouseDetailProductsList.innerHTML = ''; // Clear previous products
        if (!productsToDisplay || productsToDisplay.length === 0) {
            noProductsMessage.style.display = 'block';
            return;
        }
        noProductsMessage.style.display = 'none';

        productsToDisplay.forEach(product => {
            const li = document.createElement('li');
            li.className = 'warehouse-product-item';
            li.innerHTML = `
                <strong>${product.name}</strong><br>
                Mã HĐ nhập: ${product.codeImportBill || 'N/A'}<br>
                Loại: ${product.type || 'N/A'}<br>
                Số lượng: ${product.quantity}<br>
                Giá bán mặc định: ${formatCurrencyVND(product.price)}<br>
                Giá nhập: ${formatCurrencyVND(product.importPrice)}<br>
                Giá xuất: ${formatCurrencyVND(product.exportPrice)}<br>
                Mô tả: ${product.description || 'N/A'}
            `;
            warehouseDetailProductsList.appendChild(li);
        });
    };

    // Event listener for search in modal
    modalProductSearchButton.addEventListener('click', () => {
        const query = modalProductSearchInput.value.toLowerCase().trim();
        if (query === '') {
            renderWarehouseProductsInModal(currentWarehouseProducts); // Show all if empty
            return;
        }
        const filteredProducts = currentWarehouseProducts.filter(product =>
            product.name.toLowerCase().includes(query) ||
            (product.type && product.type.toLowerCase().includes(query)) ||
            (product.codeImportBill && product.codeImportBill.toLowerCase().includes(query)) ||
            (product.description && product.description.toLowerCase().includes(query))
        );
        renderWarehouseProductsInModal(filteredProducts);
    });

    modalProductSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            modalProductSearchButton.click();
        }
    });

    // --- Chart Logic for Products in all Warehouses ---
    const processProductsForChart = (warehouses, displayType) => {
        warehouseChartStatus.textContent = '';
        let productStatsMap = new Map(); // Key: Product Name, Value: { totalQuantity, totalValue }

        warehouses.forEach(warehouse => {
            warehouse.products.forEach(product => {
                const productName = product.name || 'Sản phẩm không tên';
                const quantity = product.quantity || 0;
                const value = (product.quantity || 0) * (product.price || 0); // Use price as default selling price

                if (!productStatsMap.has(productName)) {
                    productStatsMap.set(productName, { totalQuantity: 0, totalValue: 0 });
                }
                const currentStats = productStatsMap.get(productName);
                currentStats.totalQuantity += quantity;
                currentStats.totalValue += value;
            });
        });

        // Sort products by selected display type
        let sortedProducts = Array.from(productStatsMap.entries()).sort((a, b) => {
            if (displayType === 'quantity') {
                return b[1].totalQuantity - a[1].totalQuantity;
            } else { // value
                return b[1].totalValue - a[1].totalValue;
            }
        });

        const labels = sortedProducts.map(entry => entry[0]);
        const data = sortedProducts.map(entry => {
            if (displayType === 'quantity') {
                return entry[1].totalQuantity;
            } else {
                return entry[1].totalValue;
            }
        });

        return { labels, data };
    };

    const updateWarehouseProductChart = () => {
        if (!allWarehouses || allWarehouses.length === 0) {
            warehouseChartStatus.textContent = 'Không có dữ liệu kho để tạo biểu đồ.';
            if (warehouseProductChartInstance) warehouseProductChartChartInstance.destroy(); // Fix typo: warehouseProductChartChartInstance
            return;
        }

        const selectedDisplayType = warehouseProductChartTypeSelect.value;
        const { labels, data } = processProductsForChart(allWarehouses, selectedDisplayType);

        if (warehouseProductChartInstance) {
            warehouseProductChartInstance.destroy();
        }

        if (labels.length === 0 || data.every(val => val === 0)) {
            warehouseChartStatus.textContent = 'Không có dữ liệu sản phẩm trong kho để tạo biểu đồ này.';
            return;
        }

        const chartLabel = selectedDisplayType === 'quantity' ? 'Tổng số lượng sản phẩm' : 'Tổng giá trị sản phẩm';
        const chartColor = selectedDisplayType === 'quantity' ? 'rgba(75, 192, 192, 0.8)' : 'rgba(255, 159, 64, 0.8)'; // Xanh cho số lượng, cam cho giá trị
        const chartBorderColor = selectedDisplayType === 'quantity' ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 159, 64, 1)';

        warehouseProductChartInstance = new Chart(warehouseProductChartCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: chartLabel,
                    data: data,
                    backgroundColor: chartColor,
                    borderColor: chartBorderColor,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: selectedDisplayType === 'quantity' ? 'Số lượng' : 'Giá trị (VNĐ)'
                        },
                        ticks: {
                            callback: function(value, index, values) {
                                return selectedDisplayType === 'value' ? formatCurrencyVND(value) : value;
                            }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Sản phẩm'
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (selectedDisplayType === 'value') {
                                    label += formatCurrencyVND(context.parsed.y);
                                } else {
                                    label += context.parsed.y;
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    };

    // Event listener for chart type select
    warehouseProductChartTypeSelect.addEventListener('change', updateWarehouseProductChart);

    renderWarehouses(); // Initial load of warehouses and charts
});