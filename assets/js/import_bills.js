document.addEventListener('DOMContentLoaded', async () => {
    checkAuthAndRedirect(['admin', 'staff'], '/index/login_register.html');
    displayWelcomeMessage();
    document.getElementById('logout-button').addEventListener('click', logout);

    const currentUser = getUserFromToken();
    const isAdmin = currentUser && currentUser.role === 'admin';
    const canCreateImportBill = isAdmin || (currentUser && currentUser.permissions.includes('createImportBill'));
    const canViewImportBills = isAdmin || (currentUser && currentUser.permissions.includes('viewImportBills'));
    const canUpdateImportBill = isAdmin || (currentUser && currentUser.permissions.includes('updateImportBill'));
    const canDeleteImportBill = isAdmin || (currentUser && currentUser.permissions.includes('deleteImportBill'));

    if (isAdmin) {
        document.getElementById('admin-dashboard-link').style.display = 'block';
    } else if (currentUser && currentUser.role === 'staff') {
        document.getElementById('staff-dashboard-link').style.display = 'block';
    }

    const openAddImportBillModalBtn = document.getElementById('open-add-import-bill-modal');
    const addImportBillModal = document.getElementById('add-import-bill-modal');
    const viewImportBillDetailsModal = document.getElementById('view-import-bill-details-modal');
    const closeButtons = document.querySelectorAll('.modal .close-button');

    const importBillsTableBody = document.querySelector('#import-bills-table tbody');
    const importBillMessage = document.getElementById('import-bill-message');

    const createImportBillForm = document.getElementById('create-import-bill-form');
    const importWarehouseSelect = document.getElementById('import-warehouse-id');
    const importProductsContainer = document.getElementById('import-products-container');
    let productCounter = 0;

    const billDetailCode = document.getElementById('bill-detail-code');
    const billDetailDate = document.getElementById('bill-detail-date');
    const billDetailSupplier = document.getElementById('bill-detail-supplier');
    const billDetailStaffName = document.getElementById('bill-detail-staff-name');
    const billDetailWarehouseId = document.getElementById('bill-detail-warehouse-id');
    const billDetailNote = document.getElementById('bill-detail-note');
    const billDetailProductsList = document.getElementById('bill-detail-products-list');
    const noProductsInBillMessage = document.getElementById('no-products-in-bill-message');
    const detailEditImportButton = document.getElementById('detail-edit-import-button');
    const detailDeleteImportButton = document.getElementById('detail-delete-import-button');

    let currentViewingBillId = null;
    let productsInSelectedWarehouse = [];

    // Chart elements for Import Bills
    const importChartTypeSelect = document.getElementById('import-chart-type-select');
    const importTimeRangeSelect = document.getElementById('import-time-range-select');
    const importYearSelect = document.getElementById('import-year-select');
    const importTimeChartStatus = document.getElementById('import-time-chart-status');
    const importTimeChartCanvas = document.getElementById('importTimeChart');
    let importTimeChartInstance = null;

    const importProductChartDisplayTypeSelect = document.getElementById('import-product-chart-display-type');
    const importProductChartTopNSelect = document.getElementById('import-product-chart-top-n');
    const importProductQuantityChartCanvas = document.getElementById('importProductQuantityChart');
    const importProductChartStatus = document.getElementById('import-product-chart-status');
    let importProductQuantityChartInstance = null;

    let allImportBills = []; // Cache all fetched import bills


    // --- Chart & Data Processing (Biểu đồ theo thời gian) ---
    const setupImportYearSelect = () => {
        const currentYear = new Date().getFullYear();
        importYearSelect.innerHTML = '';
        for (let year = currentYear - 5; year <= currentYear + 2; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            if (year === currentYear) {
                option.selected = true;
            }
            importYearSelect.appendChild(option);
        }
    };

    const processImportBillsForTimeChart = (bills, chartType, timeRange, selectedYear) => {
        importTimeChartStatus.textContent = '';
        let dataMap = new Map(); // Key: Date/Month/Year, Value: { totalQuantity, totalCost }

        bills.forEach(bill => {
            const billDate = new Date(bill.date);
            if (isNaN(billDate)) return;

            if (selectedYear && billDate.getFullYear() !== parseInt(selectedYear)) {
                return;
            }

            let key;
            if (timeRange === 'daily') {
                key = billDate.toISOString().split('T')[0]; //YYYY-MM-DD
            } else if (timeRange === 'monthly') {
                key = `${billDate.getFullYear()}-${String(billDate.getMonth() + 1).padStart(2, '0')}`; //YYYY-MM
            } else { // yearly
                key = String(billDate.getFullYear()); //YYYY
            }

            if (!dataMap.has(key)) {
                dataMap.set(key, { totalQuantity: 0, totalCost: 0 });
            }

            const currentData = dataMap.get(key);
            let billTotalQuantity = 0;
            let billTotalCost = 0;

            bill.products.forEach(product => {
                billTotalQuantity += product.quantity || 0;
                billTotalCost += (product.quantity || 0) * (product.price || 0); // Use product.price (import price)
            });

            currentData.totalQuantity += billTotalQuantity;
            currentData.totalCost += billTotalCost;
        });

        const sortedKeys = Array.from(dataMap.keys()).sort();

        const labels = sortedKeys;
        const data = sortedKeys.map(key => {
            if (chartType === 'quantity') {
                return dataMap.get(key).totalQuantity;
            } else { // cost
                return dataMap.get(key).totalCost;
            }
        });

        return { labels, data };
    };

    const updateImportTimeChart = () => {
        if (!allImportBills || allImportBills.length === 0) {
            importTimeChartStatus.textContent = 'Không có dữ liệu hóa đơn nhập để tạo biểu đồ theo thời gian.';
            if (importTimeChartInstance) importTimeChartInstance.destroy();
            return;
        }

        const selectedChartType = importChartTypeSelect.value;
        const selectedTimeRange = importTimeRangeSelect.value;
        const selectedYear = importYearSelect.value;

        const { labels, data } = processImportBillsForTimeChart(allImportBills, selectedChartType, selectedTimeRange, selectedYear);

        if (importTimeChartInstance) {
            importTimeChartInstance.destroy();
        }

        if (labels.length === 0 || data.every(val => val === 0)) {
            importTimeChartStatus.textContent = 'Không có dữ liệu cho phạm vi thời gian hoặc loại biểu đồ đã chọn.';
            return;
        }

        const chartLabel = selectedChartType === 'quantity' ? 'Số lượng sản phẩm nhập' : 'Tổng giá trị nhập';
        const chartColor = selectedChartType === 'quantity' ? 'rgba(255, 206, 86, 0.8)' : 'rgba(75, 192, 192, 0.8)'; // Vàng cho số lượng, xanh cho giá trị
        const chartBorderColor = selectedChartType === 'quantity' ? 'rgba(255, 206, 86, 1)' : 'rgba(75, 192, 192, 1)';

        importTimeChartInstance = new Chart(importTimeChartCanvas, {
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
                            text: selectedChartType === 'quantity' ? 'Số lượng' : 'Giá trị (VNĐ)'
                        },
                        ticks: {
                            callback: function(value, index, values) {
                                return selectedChartType === 'cost' ? formatCurrencyVND(value) : value;
                            }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: selectedTimeRange === 'daily' ? 'Ngày' : (selectedTimeRange === 'monthly' ? 'Tháng' : 'Năm')
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
                                if (selectedChartType === 'cost') {
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


    // --- Hàm Chart & Data Processing (Biểu đồ số lượng/giá trị sản phẩm) ---
    const processImportBillsForProductChart = (bills, displayType, topN) => {
        importProductChartStatus.textContent = '';
        let productStatsMap = new Map(); // Key: Product Name, Value: { totalQuantity, totalCost }

        bills.forEach(bill => {
            bill.products.forEach(product => {
                const productName = product.name || 'Sản phẩm không tên';
                const quantity = product.quantity || 0;
                const cost = (product.quantity || 0) * (product.price || 0); // Use product.price (import price)

                if (!productStatsMap.has(productName)) {
                    productStatsMap.set(productName, { totalQuantity: 0, totalCost: 0 });
                }
                const currentStats = productStatsMap.get(productName);
                currentStats.totalQuantity += quantity;
                currentStats.totalCost += cost;
            });
        });

        // Sắp xếp sản phẩm dựa trên displayType
        let sortedProducts = Array.from(productStatsMap.entries()).sort((a, b) => {
            if (displayType === 'quantity') {
                return b[1].totalQuantity - a[1].totalQuantity; // Sắp xếp theo số lượng giảm dần
            } else { // cost
                return b[1].totalCost - a[1].totalCost; // Sắp xếp theo giá trị giảm dần
            }
        });

        if (topN !== 'all') {
            sortedProducts = sortedProducts.slice(0, parseInt(topN));
        }
        
        const labels = sortedProducts.map(entry => entry[0]);
        const data = sortedProducts.map(entry => {
            if (displayType === 'quantity') {
                return entry[1].totalQuantity;
            } else {
                return entry[1].totalCost;
            }
        });

        return { labels, data };
    };

    const updateImportProductQuantityChart = () => {
        if (!allImportBills || allImportBills.length === 0) {
            importProductChartStatus.textContent = 'Không có dữ liệu sản phẩm nhập để tạo biểu đồ.';
            if (importProductQuantityChartInstance) importProductQuantityChartInstance.destroy();
            return;
        }

        const selectedDisplayType = importProductChartDisplayTypeSelect.value;
        const selectedTopN = importProductChartTopNSelect.value;

        const { labels, data } = processImportBillsForProductChart(allImportBills, selectedDisplayType, selectedTopN);

        if (importProductQuantityChartInstance) {
            importProductQuantityChartInstance.destroy();
        }

        if (labels.length === 0 || data.every(val => val === 0)) {
            importProductChartStatus.textContent = 'Không có dữ liệu sản phẩm cho biểu đồ này.';
            return;
        }

        const chartLabel = selectedDisplayType === 'quantity' ? 'Số lượng sản phẩm nhập' : 'Giá trị nhập sản phẩm';
        const chartColor = selectedDisplayType === 'quantity' ? 'rgba(54, 162, 235, 0.8)' : 'rgba(255, 99, 132, 0.8)'; // Xanh cho số lượng, đỏ cho giá trị
        const chartBorderColor = selectedDisplayType === 'quantity' ? 'rgba(54, 162, 235, 1)' : 'rgba(255, 99, 132, 1)';

        importProductQuantityChartInstance = new Chart(importProductQuantityChartCanvas, {
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
                indexAxis: 'y', // Biểu đồ cột ngang
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: selectedDisplayType === 'quantity' ? 'Số lượng nhập' : 'Giá trị (VNĐ)'
                        },
                        ticks: {
                            callback: function(value, index, values) {
                                return selectedDisplayType === 'cost' ? formatCurrencyVND(value) : value;
                            }
                        }
                    },
                    y: {
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
                                if (selectedDisplayType === 'cost') {
                                    label += formatCurrencyVND(context.parsed.x);
                                } else {
                                    label += context.parsed.x;
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    };


    const updateAllImportCharts = () => {
        updateImportTimeChart();
        updateImportProductQuantityChart();
    };

    importChartTypeSelect.addEventListener('change', updateAllImportCharts);
    importTimeRangeSelect.addEventListener('change', updateAllImportCharts);
    importYearSelect.addEventListener('change', updateAllImportCharts);
    importProductChartDisplayTypeSelect.addEventListener('change', updateAllImportCharts);
    importProductChartTopNSelect.addEventListener('change', updateAllImportCharts);


    if (canCreateImportBill) {
        openAddImportBillModalBtn.style.display = 'block';
    }

    openAddImportBillModalBtn.addEventListener('click', () => {
        addImportBillModal.style.display = 'flex';
        createImportBillForm.reset();
        importProductsContainer.innerHTML = '';
        productCounter = 0;
        addOneProductEntry();
        productsInSelectedWarehouse = [];
        importWarehouseSelect.value = "";
    });

    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            addImportBillModal.style.display = 'none';
            viewImportBillDetailsModal.style.display = 'none';
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target == addImportBillModal) {
            addImportBillModal.style.display = 'none';
        }
        if (event.target == viewImportBillDetailsModal) {
            viewImportBillDetailsModal.style.display = 'none';
        }
    });

    const loadWarehouses = async () => {
        try {
            const warehouses = await getAllWarehouses();
            importWarehouseSelect.innerHTML = '<option value="">Chọn Kho</option>';
            warehouses.forEach(warehouse => {
                const option = document.createElement('option');
                option.value = warehouse._id;
                option.textContent = warehouse.name;
                importWarehouseSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Lỗi khi tải danh sách kho:', error);
            alert('Lỗi khi tải danh sách kho để chọn.');
        }
    };
    await loadWarehouses();

    importWarehouseSelect.addEventListener('change', async () => {
        const warehouseId = importWarehouseSelect.value;
        if (warehouseId) {
            try {
                const warehouse = await getWarehouseById(warehouseId);
                productsInSelectedWarehouse = warehouse.products || [];
                updateExistingProductDropdowns();
            } catch (error) { // Added missing catch block
                console.error('Lỗi khi tải sản phẩm của kho đã chọn:', error);
                productsInSelectedWarehouse = [];
                alert('Lỗi khi tải sản phẩm của kho đã chọn.');
            }
        } else {
            productsInSelectedWarehouse = [];
            updateExistingProductDropdowns();
        }
    });

    const addOneProductEntry = (initialChoice = 'new_product') => {
        const currentId = productCounter++;
        const newProductItem = document.createElement('div');
        newProductItem.className = 'product-item';
        newProductItem.innerHTML = `
            <div class="product-choice-options">
                <label><input type="radio" name="product_type_${currentId}" value="new_product" ${initialChoice === 'new_product' ? 'checked' : ''}> Sản phẩm mới</label>
                <label><input type="radio" name="product_type_${currentId}" value="existing_product" ${initialChoice === 'existing_product' ? 'checked' : ''}> Sản phẩm có sẵn</label>
            </div>
            <div id="new-product-fields-${currentId}" class="product-choice-container" style="display: ${initialChoice === 'new_product' ? 'block' : 'none'};">
                <label for="product-name-${currentId}">Tên sản phẩm:</label>
                <input type="text" id="product-name-${currentId}" class="import-product-name" ${initialChoice === 'new_product' ? 'required' : ''}>
                <label for="product-type-${currentId}">Loại:</label>
                <input type="text" id="product-type-${currentId}" class="import-product-type">
                <label for="product-description-${currentId}">Mô tả:</label>
                <textarea id="product-description-${currentId}" class="import-product-description"></textarea>
                <label for="product-quantity-${currentId}">Số lượng:</label>
                <input type="number" id="product-quantity-${currentId}" class="import-product-quantity" ${initialChoice === 'new_product' ? 'required' : ''} min="1">
                <label for="product-price-${currentId}">Giá (mỗi đơn vị):</label>
                <input type="number" id="product-price-${currentId}" class="import-product-price" ${initialChoice === 'new_product' ? 'required' : ''} step="1" min="1">
            </div>
            <div id="existing-product-fields-${currentId}" class="product-choice-container" style="display: ${initialChoice === 'existing_product' ? 'block' : 'none'};">
                <label for="existing-product-select-${currentId}">Chọn sản phẩm có sẵn:</label>
                <select id="existing-product-select-${currentId}" class="import-existing-product-select" ${initialChoice === 'existing_product' ? 'required' : ''}>
                    <option value="">Chọn sản phẩm</option>
                    </select>
                <label for="existing-product-quantity-${currentId}">Số lượng nhập thêm:</label>
                <input type="number" id="existing-product-quantity-${currentId}" class="import-existing-product-quantity" ${initialChoice === 'existing_product' ? 'required' : ''} min="1">
                <p>Tên SP: <span class="existing-product-name-display"></span>, Hiện có: <span class="existing-product-current-quantity-display"></span></p>
                <label for="existing-product-price-${currentId}">Giá nhập (mỗi đơn vị):</label>
                <input type="number" id="existing-product-price-${currentId}" class="import-existing-product-price" step="1" min="1">
            </div>
            <button type="button" class="remove-product-from-import">Xóa</button>
        `;
        importProductsContainer.appendChild(newProductItem);

        newProductItem.querySelectorAll(`input[name="product_type_${currentId}"]`).forEach(radio => {
            radio.addEventListener('change', (e) => {
                const newFields = newProductItem.querySelector(`#new-product-fields-${currentId}`);
                const existingFields = newProductItem.querySelector(`#existing-product-fields-${currentId}`);
                
                if (e.target.value === 'new_product') {
                    newFields.style.display = 'block';
                    existingFields.style.display = 'none';
                    newFields.querySelectorAll('input, textarea').forEach(input => input.setAttribute('required', ''));
                    existingFields.querySelectorAll('input, select').forEach(input => input.removeAttribute('required'));
                    existingFields.querySelectorAll('input, select').forEach(input => input.value = '');
                } else {
                    newFields.style.display = 'none';
                    existingFields.style.display = 'block';
                    newFields.querySelectorAll('input, textarea').forEach(input => input.removeAttribute('required'));
                    newFields.querySelectorAll('input, textarea').forEach(input => input.value = '');
                    existingFields.querySelectorAll('input, select').forEach(input => input.setAttribute('required', ''));
                }
            });
        });

        newProductItem.querySelector('.remove-product-from-import').addEventListener('click', (e) => {
            e.target.closest('.product-item').remove();
        });

        const existingProductSelect = newProductItem.querySelector(`#existing-product-select-${currentId}`);
        const existingProductNameDisplay = newProductItem.querySelector('.existing-product-name-display');
        const existingProductCurrentQuantityDisplay = newProductItem.querySelector('.existing-product-current-quantity-display');
        const existingProductPriceInput = newProductItem.querySelector(`#existing-product-price-${currentId}`);
        
        existingProductSelect.innerHTML = '<option value="">Chọn sản phẩm</option>' + 
            productsInSelectedWarehouse.map(p => `<option value="${p._id}" 
                data-name="${p.name}" 
                data-type="${p.type || ''}" 
                data-description="${p.description || ''}" 
                data-quantity="${p.quantity}"
                data-price="${p.price !== undefined ? p.price : ''}"
                data-import-price="${p.importPrice !== undefined ? p.importPrice : ''}"
                data-export-price="${p.exportPrice !== undefined ? p.exportPrice : ''}">
                ${p.name} (Hiện có: ${p.quantity})
            </option>`).join('');

        existingProductSelect.addEventListener('change', (e) => {
            const selectedProductId = e.target.value;
            const selectedOption = existingProductSelect.options[existingProductSelect.selectedIndex];
            if (selectedProductId) {
                existingProductNameDisplay.textContent = selectedOption.dataset.name;
                existingProductCurrentQuantityDisplay.textContent = selectedOption.dataset.quantity;
                existingProductPriceInput.value = Math.round(parseFloat(selectedOption.dataset.importPrice || selectedOption.dataset.price || ''));
            } else {
                existingProductNameDisplay.textContent = '';
                existingProductCurrentQuantityDisplay.textContent = '';
                existingProductPriceInput.value = '';
            }
        });
    };

    const updateExistingProductDropdowns = () => {
        document.querySelectorAll('.import-existing-product-select').forEach(selectElement => {
            const currentSelectedValue = selectElement.value;
            selectElement.innerHTML = '<option value="">Chọn sản phẩm</option>' + 
                productsInSelectedWarehouse.map(p => `<option value="${p._id}" 
                    data-name="${p.name}" 
                    data-type="${p.type || ''}" 
                    data-description="${p.description || ''}" 
                    data-quantity="${p.quantity}"
                    data-price="${p.price !== undefined ? p.price : ''}"
                    data-import-price="${p.importPrice !== undefined ? p.importPrice : ''}"
                    data-export-price="${p.exportPrice !== undefined ? p.exportPrice : ''}"
                    ${p._id === currentSelectedValue ? 'selected' : ''}>
                    ${p.name} (Hiện có: ${p.quantity})
                </option>`).join('');
            
            const selectedOption = selectElement.options[selectElement.selectedIndex];
            const productItemContainer = selectElement.closest('.product-item');
            if (productItemContainer && selectedOption && selectedOption.value) {
                productItemContainer.querySelector('.existing-product-name-display').textContent = selectedOption.dataset.name;
                productItemContainer.querySelector('.existing-product-current-quantity-display').textContent = selectedOption.dataset.quantity;
                productItemContainer.querySelector('.import-existing-product-price').value = Math.round(parseFloat(selectedOption.dataset.importPrice || selectedOption.dataset.price || ''));
            } else if (productItemContainer) {
                productItemContainer.querySelector('.existing-product-name-display').textContent = '';
                productItemContainer.querySelector('.existing-product-current-quantity-display').textContent = '';
                productItemContainer.querySelector('.import-existing-product-price').value = '';
            }
        });
    };

    document.getElementById('add-product-to-import').addEventListener('click', () => {
        addOneProductEntry();
    });

    createImportBillForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const supplier = createImportBillForm['import-supplier'].value;
        const warehouseId = createImportBillForm['import-warehouse-id'].value;
        const note = createImportBillForm['import-note'].value;

        const products = [];
        let hasError = false;

        document.querySelectorAll('#import-products-container .product-item').forEach(itemDiv => {
            const radioType = itemDiv.querySelector('input[type="radio"]:checked').value;
            let productData = {};

            if (radioType === 'new_product') {
                productData = {
                    name: itemDiv.querySelector('.import-product-name').value,
                    type: itemDiv.querySelector('.import-product-type').value,
                    description: itemDiv.querySelector('.import-product-description').value,
                    quantity: parseInt(itemDiv.querySelector('.import-product-quantity').value),
                    price: parseFloat(itemDiv.querySelector('.import-product-price').value)
                };
                if (!productData.name || isNaN(productData.quantity) || productData.quantity <= 0 || isNaN(productData.price) || productData.price <= 0) {
                    alert('Vui lòng điền đầy đủ và chính xác thông tin (Tên SP, Số lượng > 0, Giá > 0) cho sản phẩm mới.');
                    hasError = true;
                    return;
                }
            } else { // existing_product
                const selectedOption = itemDiv.querySelector('.import-existing-product-select').options[itemDiv.querySelector('.import-existing-product-select').selectedIndex];
                if (!selectedOption || !selectedOption.value) {
                    alert('Vui lòng chọn một sản phẩm có sẵn hoặc xóa mục này.');
                    hasError = true;
                    return;
                }
                productData = {
                    warehouseProductId: selectedOption.value,
                    quantity: parseInt(itemDiv.querySelector('.import-existing-product-quantity').value),
                    price: parseFloat(itemDiv.querySelector('.import-existing-product-price').value)
                };
                if (isNaN(productData.quantity) || productData.quantity <= 0 || isNaN(productData.price) || productData.price <= 0) {
                    alert('Vui lòng điền đầy đủ và chính xác thông tin (Số lượng > 0, Giá > 0) cho sản phẩm có sẵn.');
                    hasError = true;
                    return;
                }
                productData.name = selectedOption.dataset.name;
                productData.type = selectedOption.dataset.type;
                productData.description = selectedOption.dataset.description;
            }
            products.push(productData);
        });

        if (hasError) {
            return;
        }
        if (products.length === 0) {
            alert('Vui lòng thêm ít nhất một sản phẩm vào hóa đơn nhập.');
            return;
        }

        try {
            const response = await createImportBill({ supplier, products, note, warehouseId });
            alert('Hóa đơn nhập đã được tạo thành công! Mã: ' + response.code);
            createImportBillForm.reset();
            importProductsContainer.innerHTML = '';
            productCounter = 0;
            addImportBillModal.style.display = 'none';
            renderImportBills();
        } catch (error) {
            alert('Lỗi khi tạo hóa đơn nhập: ' + error.message);
        }
    });

    const renderImportBills = async () => {
        importBillsTableBody.innerHTML = '';
        if (!canViewImportBills) {
            importBillMessage.textContent = 'Bạn không có quyền xem hóa đơn nhập.';
            return;
        }
        try {
            allImportBills = await getAllImportBills(); // Cache all import bills for charts
            if (allImportBills.length === 0) {
                importBillMessage.textContent = 'Không có hóa đơn nhập nào được tìm thấy.';
                // Clear charts if no data
                if (importTimeChartInstance) importTimeChartInstance.destroy();
                if (importProductQuantityChartInstance) importProductQuantityChartInstance.destroy();
                importTimeChartStatus.textContent = 'Không có dữ liệu để tạo biểu đồ.';
                importProductChartStatus.textContent = 'Không có dữ liệu để tạo biểu đồ.';
                return;
            }

            allImportBills.forEach(bill => { // Changed bills.forEach to allImportBills.forEach
                const row = importBillsTableBody.insertRow();
                row.insertCell().textContent = bill.code;
                row.insertCell().textContent = new Date(bill.date).toLocaleDateString();
                row.insertCell().textContent = bill.supplier;
                row.insertCell().textContent = bill.staffName || 'N/A';
                row.insertCell().textContent = bill.warehouse || 'N/A';
                row.insertCell().textContent = bill.products.length;
                row.insertCell().textContent = bill.note || '';

                const actionsCell = row.insertCell();
                const viewDetailsBtn = document.createElement('button');
                viewDetailsBtn.textContent = 'Xem chi tiết';
                viewDetailsBtn.addEventListener('click', () => showImportBillDetails(bill));
                actionsCell.appendChild(viewDetailsBtn);
            });
            // Update charts after bills are rendered
            updateAllImportCharts();
        } catch (error) {
            importBillMessage.textContent = `Lỗi khi tải hóa đơn nhập: ${error.message}`;
            console.error('Lỗi khi tải hóa đơn nhập:', error);
            // Clear charts if there's an error loading data
            if (importTimeChartInstance) importTimeChartInstance.destroy();
            if (importProductQuantityChartInstance) importProductQuantityChartInstance.destroy();
            importTimeChartStatus.textContent = 'Lỗi khi tải dữ liệu cho biểu đồ.';
            importProductChartStatus.textContent = 'Lỗi khi tải dữ liệu cho biểu đồ.';
        }
    };

    const showImportBillDetails = (bill) => {
        currentViewingBillId = bill._id;

        billDetailCode.textContent = bill.code;
        billDetailDate.textContent = new Date(bill.date).toLocaleDateString();
        billDetailSupplier.textContent = bill.supplier;
        billDetailStaffName.textContent = bill.staffName || 'N/A';
        billDetailWarehouseId.textContent = bill.warehouse || 'N/A';
        billDetailNote.textContent = bill.note || 'N/A';
        billDetailProductsList.innerHTML = '';

        if (bill.products && bill.products.length > 0) {
            noProductsInBillMessage.style.display = 'none';
            bill.products.forEach(product => {
                const li = document.createElement('li');
                li.className = 'detail-product-item';
                li.innerHTML = `
                    <strong>${product.name}</strong><br>
                    Loại: ${product.type || 'N/A'}<br>
                    Mô tả: ${product.description || 'N/A'}<br>
                    Số lượng: ${product.quantity}<br>
                    Giá (mỗi đơn vị): ${formatCurrencyVND(product.price)}
                `;
                billDetailProductsList.appendChild(li);
            });
        } else {
            noProductsInBillMessage.style.display = 'block';
        }

        if (canUpdateImportBill) {
            detailEditImportButton.style.display = 'inline-block';
        } else {
            detailEditImportButton.style.display = 'none';
        }
        if (canDeleteImportBill) {
            detailDeleteImportButton.style.display = 'inline-block';
        } else {
            detailDeleteImportButton.style.display = 'none';
        }
        
        viewImportBillDetailsModal.style.display = 'flex';
    };

    detailEditImportButton.addEventListener('click', () => {
        if (currentViewingBillId) {
            alert('Chức năng Sửa hóa đơn nhập (ID: ' + currentViewingBillId + ') sẽ được mở ra để chỉnh sửa. (Chưa triển khai chi tiết)');
        }
    });

    detailDeleteImportButton.addEventListener('click', async () => {
        if (currentViewingBillId && confirm(`Bạn có chắc chắn muốn xóa hóa đơn nhập này (ID: ${currentViewingBillId})?`)) {
            try {
                await deleteImportBill(currentViewingBillId);
                alert('Hóa đơn nhập đã được xóa thành công!');
                viewImportBillDetailsModal.style.display = 'none';
                renderImportBills();
            } catch (error) {
                alert('Lỗi khi xóa hóa đơn nhập: ' + error.message);
            }
        }
    });

    // Initial setup and render
    setupImportYearSelect();
    renderImportBills();
});