document.addEventListener('DOMContentLoaded', async () => {
    checkAuthAndRedirect(['admin', 'staff'], '/index/login_register.html');
    displayWelcomeMessage();
    document.getElementById('logout-button').addEventListener('click', logout);

    const currentUser = getUserFromToken();
    const isAdmin = currentUser && currentUser.role === 'admin';
    const canCreateExportBill = isAdmin || (currentUser && currentUser.permissions.includes('createExportBill'));
    const canViewExportBills = isAdmin || (currentUser && currentUser.permissions.includes('viewExportBills'));
    const canUpdateExportBill = isAdmin || (currentUser && currentUser.permissions.includes('updateExportBill'));
    const canDeleteExportBill = isAdmin || (currentUser && currentUser.permissions.includes('deleteExportBill'));

    if (isAdmin) {
        document.getElementById('admin-dashboard-link').style.display = 'block';
    } else if (currentUser && currentUser.role === 'staff') {
        document.getElementById('staff-dashboard-link').style.display = 'block';
    }

    const openAddExportBillModalBtn = document.getElementById('open-add-export-bill-modal');
    const addExportBillModal = document.getElementById('add-export-bill-modal');
    const viewExportBillDetailsModal = document.getElementById('view-export-bill-details-modal');
    const closeButtons = document.querySelectorAll('.modal .close-button');

    const exportBillsTableBody = document.querySelector('#export-bills-table tbody');
    const exportBillMessage = document.getElementById('export-bill-message');

    const createExportBillForm = document.getElementById('create-export-bill-form');
    const exportWarehouseSelect = document.getElementById('export-warehouse-id');
    const exportProductsContainer = document.getElementById('export-products-container');
    let selectedWarehouseProducts = [];
    let exportProductCounter = 0;

    // Customer selection elements
    const customerSelectionTypeRadios = document.querySelectorAll('input[name="customer_selection_type"]');
    const newCustomerFields = document.getElementById('new-customer-fields');
    const existingCustomerFields = document.getElementById('existing-customer-fields');
    const existingCustomerSelect = document.getElementById('existing-customer-select');
    const displayExistingCustomerName = document.getElementById('display-existing-customer-name');
    const displayExistingCustomerPhone = document.getElementById('display-existing-customer-phone');
    const displayExistingCustomerAddress = document.getElementById('display-existing-customer-address');
    const displayExistingCustomerEmail = document.getElementById('display-existing-customer-email');
    const displayExistingCustomerSeri = document.getElementById('display-existing-customer-seri');
    let allCustomers = []; // Cache all customers

    // New Customer input fields
    const newCustomerNameInput = document.getElementById('new-customer-name');
    const newCustomerPhoneInput = document.getElementById('new-customer-phone');
    const newCustomerAddressInput = document.getElementById('new-customer-address');
    const newCustomerEmailInput = document.getElementById('new-customer-email');
    const newCustomerSeriInput = document.getElementById('new-customer-seri');


    const billDetailCode = document.getElementById('bill-detail-code');
    const billDetailDate = document.getElementById('bill-detail-date');
    const billDetailCustomerName = document.getElementById('bill-detail-customer-name');
    const billDetailCustomerPhone = document.getElementById('bill-detail-customer-phone');
    const billDetailCustomerAddress = document.getElementById('bill-detail-customer-address');
    const billDetailStaffName = document.getElementById('bill-detail-staff-name');
    const billDetailNote = document.getElementById('bill-detail-note');
    const billDetailProductsList = document.getElementById('bill-detail-products-list');
    const noProductsInBillMessage = document.getElementById('no-products-in-bill-message');
    const detailEditExportButton = document.getElementById('detail-edit-export-button');
    const detailDeleteExportButton = document.getElementById('detail-delete-export-button');

    let currentViewingExportBillId = null;

    // Chart elements
    const chartTypeSelect = document.getElementById('chart-type-select');
    const timeRangeSelect = document.getElementById('time-range-select');
    const yearSelect = document.getElementById('year-select');
    const timeChartStatus = document.getElementById('time-chart-status');
    const exportTimeChartCanvas = document.getElementById('exportTimeChart');
    let exportTimeChartInstance = null;

    const productChartDisplayTypeSelect = document.getElementById('product-chart-display-type');
    const productChartTopNSelect = document.getElementById('product-chart-top-n');
    const exportProductQuantityChartCanvas = document.getElementById('exportProductQuantityChart');
    const productChartStatus = document.getElementById('product-chart-status');
    let exportProductQuantityChartInstance = null;


    let allExportBills = [];


    // --- Hàm Chart & Data Processing (Biểu đồ theo thời gian) ---
    const setupYearSelect = () => {
        const currentYear = new Date().getFullYear();
        yearSelect.innerHTML = '';
        for (let year = currentYear - 5; year <= currentYear + 2; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            if (year === currentYear) {
                option.selected = true;
            }
            yearSelect.appendChild(option);
        }
    };

    const processBillsForTimeChart = (bills, chartType, timeRange, selectedYear) => {
        timeChartStatus.textContent = '';
        let dataMap = new Map();

        bills.forEach(bill => {
            const billDate = new Date(bill.date);
            if (isNaN(billDate)) return;

            if (selectedYear && billDate.getFullYear() !== parseInt(selectedYear)) {
                return;
            }

            let key;
            if (timeRange === 'daily') {
                key = billDate.toISOString().split('T')[0];
            } else if (timeRange === 'monthly') {
                key = `${billDate.getFullYear()}-${String(billDate.getMonth() + 1).padStart(2, '0')}`;
            } else {
                key = String(billDate.getFullYear());
            }

            if (!dataMap.has(key)) {
                dataMap.set(key, { totalQuantity: 0, totalRevenue: 0 });
            }

            const currentData = dataMap.get(key);
            let billTotalQuantity = 0;
            let billTotalRevenue = 0;

            bill.products.forEach(product => {
                billTotalQuantity += product.quantity || 0;
                billTotalRevenue += (product.quantity || 0) * (product.price || 0);
            });

            currentData.totalQuantity += billTotalQuantity;
            currentData.totalRevenue += billTotalRevenue;
        });

        const sortedKeys = Array.from(dataMap.keys()).sort();

        const labels = sortedKeys;
        const data = sortedKeys.map(key => {
            if (chartType === 'quantity') {
                return dataMap.get(key).totalQuantity;
            } else {
                return dataMap.get(key).totalRevenue;
            }
        });

        return { labels, data };
    };

    const updateTimeChart = () => {
        if (!allExportBills || allExportBills.length === 0) {
            timeChartStatus.textContent = 'Không có dữ liệu hóa đơn xuất để tạo biểu đồ theo thời gian.';
            if (exportTimeChartInstance) exportTimeChartInstance.destroy();
            return;
        }

        const selectedChartType = chartTypeSelect.value;
        const selectedTimeRange = timeRangeSelect.value;
        const selectedYear = yearSelect.value;

        const { labels, data } = processBillsForTimeChart(allExportBills, selectedChartType, selectedTimeRange, selectedYear);

        if (exportTimeChartInstance) {
            exportTimeChartInstance.destroy();
        }

        if (labels.length === 0 || data.every(val => val === 0)) {
            timeChartStatus.textContent = 'Không có dữ liệu cho phạm vi thời gian hoặc loại biểu đồ đã chọn.';
            return;
        }

        const chartLabel = selectedChartType === 'quantity' ? 'Số lượng sản phẩm xuất' : 'Tổng doanh thu';
        const chartColor = selectedChartType === 'quantity' ? 'rgba(75, 192, 192, 0.8)' : 'rgba(153, 102, 255, 0.8)';
        const chartBorderColor = selectedChartType === 'quantity' ? 'rgba(75, 192, 192, 1)' : 'rgba(153, 102, 255, 1)';

        exportTimeChartInstance = new Chart(exportTimeChartCanvas, {
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
                            text: selectedChartType === 'quantity' ? 'Số lượng' : 'Doanh thu (VNĐ)'
                        },
                        ticks: {
                            callback: function(value, index, values) {
                                return selectedChartType === 'revenue' ? formatCurrencyVND(value) : value;
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
                                if (selectedChartType === 'revenue') {
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


    const processBillsForProductChart = (bills, displayType, topN) => {
        productChartStatus.textContent = '';
        let productStatsMap = new Map();

        bills.forEach(bill => {
            bill.products.forEach(product => {
                const productName = product.name || 'Sản phẩm không tên';
                const quantity = product.quantity || 0;
                const revenue = (product.quantity || 0) * (product.price || 0);

                if (!productStatsMap.has(productName)) {
                    productStatsMap.set(productName, { totalQuantity: 0, totalRevenue: 0 });
                }
                const currentStats = productStatsMap.get(productName);
                currentStats.totalQuantity += quantity;
                currentStats.totalRevenue += revenue;
            });
        });

        let sortedProducts = Array.from(productStatsMap.entries()).sort((a, b) => {
            if (displayType === 'quantity') {
                return b[1].totalQuantity - a[1].totalQuantity;
            } else {
                return b[1].totalRevenue - a[1].totalRevenue;
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
                return entry[1].totalRevenue;
            }
        });

        return { labels, data };
    };

    const updateProductQuantityChart = () => {
        if (!allExportBills || allExportBills.length === 0) {
            productChartStatus.textContent = 'Không có dữ liệu sản phẩm xuất để tạo biểu đồ.';
            if (exportProductQuantityChartInstance) exportProductQuantityChartInstance.destroy();
            return;
        }

        const selectedDisplayType = productChartDisplayTypeSelect.value;
        const selectedTopN = productChartTopNSelect.value;

        const { labels, data } = processBillsForProductChart(allExportBills, selectedDisplayType, selectedTopN);

        if (exportProductQuantityChartInstance) {
            exportProductQuantityChartInstance.destroy();
        }

        if (labels.length === 0 || data.every(val => val === 0)) {
            productChartStatus.textContent = 'Không có dữ liệu sản phẩm cho biểu đồ này.';
            return;
        }

        const chartLabel = selectedDisplayType === 'quantity' ? 'Số lượng sản phẩm xuất' : 'Doanh thu sản phẩm';
        const chartColor = selectedDisplayType === 'quantity' ? 'rgba(255, 99, 132, 0.8)' : 'rgba(54, 162, 235, 0.8)';
        const chartBorderColor = selectedDisplayType === 'quantity' ? 'rgba(255, 99, 132, 1)' : 'rgba(54, 162, 235, 1)';

        exportProductQuantityChartInstance = new Chart(exportProductQuantityChartCanvas, {
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
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: selectedDisplayType === 'quantity' ? 'Số lượng xuất' : 'Doanh thu (VNĐ)'
                        },
                        ticks: {
                            callback: function(value, index, values) {
                                return selectedDisplayType === 'revenue' ? formatCurrencyVND(value) : value;
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
                                if (selectedDisplayType === 'revenue') {
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


    const updateAllCharts = () => {
        updateTimeChart();
        updateProductQuantityChart();
    };

    chartTypeSelect.addEventListener('change', updateAllCharts);
    timeRangeSelect.addEventListener('change', updateAllCharts);
    yearSelect.addEventListener('change', updateAllCharts);
    productChartDisplayTypeSelect.addEventListener('change', updateAllCharts);
    productChartTopNSelect.addEventListener('change', updateAllCharts);


    if (canCreateExportBill) {
        openAddExportBillModalBtn.style.display = 'block';
    }

    openAddExportBillModalBtn.addEventListener('click', () => {
        addExportBillModal.style.display = 'flex';
        // Reset customer selection
        newCustomerFields.style.display = 'block';
        existingCustomerFields.style.display = 'none';
        customerSelectionTypeRadios[0].checked = true; // Default to new customer
        createExportBillForm.reset(); // Clear all form fields including customer
        loadCustomersForSelection(); // Reload customers
        
        // Reset product section
        exportProductsContainer.innerHTML = '<p class="product-select-container">Chọn một kho để xem sản phẩm có sẵn.</p>';
        selectedWarehouseProducts = [];
        exportProductCounter = 0;
        exportWarehouseSelect.value = ""; // Clear selected warehouse
    });

    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            addExportBillModal.style.display = 'none';
            viewExportBillDetailsModal.style.display = 'none';
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target == addExportBillModal) {
            addExportBillModal.style.display = 'none';
        }
        if (event.target == viewExportBillDetailsModal) {
            viewExportBillDetailsModal.style.display = 'none';
        }
    });

    // Customer Selection Logic
    customerSelectionTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'new_customer') {
                newCustomerFields.style.display = 'block';
                existingCustomerFields.style.display = 'none';
                // Set required for new customer fields
                newCustomerNameInput.setAttribute('required', '');
                newCustomerPhoneInput.setAttribute('required', '');
                existingCustomerSelect.removeAttribute('required');
                existingCustomerSelect.value = ''; // Clear existing customer selection
            } else {
                newCustomerFields.style.display = 'none';
                existingCustomerFields.style.display = 'block';
                // Set required for existing customer select
                newCustomerNameInput.removeAttribute('required');
                newCustomerPhoneInput.removeAttribute('required');
                existingCustomerSelect.setAttribute('required', '');
                // Clear new customer fields
                newCustomerNameInput.value = '';
                newCustomerPhoneInput.value = '';
                newCustomerAddressInput.value = '';
                newCustomerEmailInput.value = '';
                newCustomerSeriInput.value = '';
            }
        });
    });

    const loadCustomersForSelection = async () => {
        try {
            allCustomers = await getAllCustomers(); // Fetch all customers
            existingCustomerSelect.innerHTML = '<option value="">-- Chọn Khách hàng --</option>';
            allCustomers.forEach(customer => {
                const option = document.createElement('option');
                option.value = customer._id;
                option.textContent = `${customer.name} (${customer.phone})`;
                // Store full customer data in dataset for easy access
                option.dataset.name = customer.name;
                option.dataset.phone = customer.phone;
                option.dataset.address = customer.address || '';
                option.dataset.email = customer.email || '';
                option.dataset.seri = customer.seri || '';
                existingCustomerSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Lỗi khi tải danh sách khách hàng:', error);
            alert('Lỗi khi tải danh sách khách hàng để chọn.');
        }
    };
    // Call on page load or when modal opens
    // await loadCustomersForSelection(); // Will be called when modal opens

    existingCustomerSelect.addEventListener('change', (e) => {
        const selectedCustomerId = e.target.value;
        const selectedOption = existingCustomerSelect.options[existingCustomerSelect.selectedIndex];
        if (selectedCustomerId) {
            displayExistingCustomerName.textContent = selectedOption.dataset.name;
            displayExistingCustomerPhone.textContent = selectedOption.dataset.phone;
            displayExistingCustomerAddress.textContent = selectedOption.dataset.address;
            displayExistingCustomerEmail.textContent = selectedOption.dataset.email;
            displayExistingCustomerSeri.textContent = selectedOption.dataset.seri;
        } else {
            displayExistingCustomerName.textContent = '';
            displayExistingCustomerPhone.textContent = '';
            displayExistingCustomerAddress.textContent = '';
            displayExistingCustomerEmail.textContent = '';
            displayExistingCustomerSeri.textContent = '';
        }
    });

    const loadWarehousesForExport = async () => {
        try {
            const warehouses = await getAllWarehouses();
            exportWarehouseSelect.innerHTML = '<option value="">-- Chọn Kho --</option>';
            warehouses.forEach(warehouse => {
                const option = document.createElement('option');
                option.value = warehouse._id;
                option.textContent = warehouse.name;
                exportWarehouseSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Lỗi khi tải kho cho xuất hàng:', error);
            alert('Lỗi khi tải kho cho xuất hàng: ' + error.message);
        }
    };
    await loadWarehousesForExport();

    exportWarehouseSelect.addEventListener('change', async () => {
        const warehouseId = exportWarehouseSelect.value;
        exportProductsContainer.innerHTML = '<p class="product-select-container">Chọn một kho để xem sản phẩm có sẵn.</p>';
        selectedWarehouseProducts = [];
        exportProductCounter = 0;

        if (warehouseId) {
            try {
                const warehouse = await getWarehouseById(warehouseId);
                if (warehouse && warehouse.products && warehouse.products.length > 0) {
                    selectedWarehouseProducts = warehouse.products;
                    exportProductsContainer.innerHTML = '<p class="product-select-container">Sản phẩm có sẵn trong kho đã chọn:</p>';
                } else {
                    exportProductsContainer.innerHTML = '<p class="product-select-container">Không có sản phẩm trong kho này.</p>';
                }
            } catch (error) {
                console.error('Lỗi khi lấy sản phẩm trong kho:', error);
                exportProductsContainer.innerHTML = '<p class="product-select-container">Lỗi tải sản phẩm cho kho này.</p>';
            }
        } else {
            exportProductsContainer.innerHTML = '<p class="product-select-container">Chọn một kho để xem sản phẩm có sẵn.</p>';
        }
    });

    document.getElementById('add-product-to-export').addEventListener('click', () => {
        if (!exportWarehouseSelect.value || selectedWarehouseProducts.length === 0) {
            alert('Vui lòng chọn một kho có sản phẩm có sẵn trước.');
            return;
        }

        const currentProductCounter = exportProductCounter;
        const newProductEntry = document.createElement('div');
        newProductEntry.className = 'export-product-entry';
        // Sửa lỗi cú pháp ở đây: thêm thẻ đóng div cho container của input giá và nút xóa.
        newProductEntry.innerHTML = `
            <hr>
            <label for="export-prod-id-${currentProductCounter}">Chọn Sản phẩm:</label>
            <select id="export-prod-id-${currentProductCounter}" class="export-product-id" required>
                <option value="">-- Chọn Sản phẩm --</option>
                ${selectedWarehouseProducts.map(p => `<option value="${p._id}" data-name="${p.name}" data-type="${p.type}" data-description="${p.description}" data-price="${p.price}" data-import-price="${p.importPrice}" data-export-price="${p.exportPrice}" data-max-qty="${p.quantity}">${p.name} (SL: ${p.quantity})</option>`).join('')}
            </select>
            <label for="export-qty-${currentProductCounter}">Số lượng:</label>
            <input type="number" id="export-qty-${currentProductCounter}" class="export-product-quantity" required min="1">
            <label for="export-price-${currentProductCounter}">Giá bán:</label>
            <input type="number" id="export-price-${currentProductCounter}" class="export-product-selling-price" step="1" required min="1">
            <button type="button" class="remove-export-product">Xóa Sản phẩm</button>
        `;
        exportProductsContainer.appendChild(newProductEntry);
        exportProductCounter++;

        const productSelect = newProductEntry.querySelector('.export-product-id');
        const sellingPriceInput = newProductEntry.querySelector('.export-product-selling-price');
        const qtyInput = newProductEntry.querySelector('.export-product-quantity');

        productSelect.addEventListener('change', () => {
            const selectedOption = productSelect.options[productSelect.selectedIndex];
            if (selectedOption.value) {
                const defaultPrice = parseFloat(selectedOption.dataset.price);
                if (!isNaN(defaultPrice)) {
                    sellingPriceInput.value = defaultPrice.toFixed(0);
                }
            } else {
                sellingPriceInput.value = '';
            }
            qtyInput.value = '';
        });

        qtyInput.addEventListener('input', () => {
            const selectedOption = productSelect.options[productSelect.selectedIndex];
            if (!selectedOption.value) {
                alert('Vui lòng chọn sản phẩm trước khi nhập số lượng.');
                qtyInput.value = '';
                return;
            }
            const maxQty = parseInt(selectedOption.dataset.maxQty);
            const currentQty = parseInt(qtyInput.value);
            if (currentQty > maxQty) {
                alert(`Không thể xuất quá số lượng có sẵn (${maxQty}).`);
                qtyInput.value = maxQty;
            }
        });

        newProductEntry.querySelector('.remove-export-product').addEventListener('click', (e) => {
            e.target.closest('.export-product-entry').remove();
        });
    });

    createExportBillForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let customerDetails = {};
        const selectedCustomerType = document.querySelector('input[name="customer_selection_type"]:checked').value;

        if (selectedCustomerType === 'new_customer') {
            customerDetails = {
                name: newCustomerNameInput.value,
                phone: newCustomerPhoneInput.value,
                address: newCustomerAddressInput.value,
                email: newCustomerEmailInput.value,
                seri: newCustomerSeriInput.value,
            };
            if (!customerDetails.name || !customerDetails.phone) {
                alert('Vui lòng điền đầy đủ Tên khách hàng và Số điện thoại cho khách hàng mới.');
                return;
            }
        } else { // existing_customer
            const selectedOption = existingCustomerSelect.options[existingCustomerSelect.selectedIndex];
            if (!selectedOption || !selectedOption.value) {
                alert('Vui lòng chọn một khách hàng có sẵn.');
                return;
            }
            // Send essential details of existing customer for backend lookup/update
            customerDetails = {
                _id: selectedOption.value, // Send ID for explicit identification
                name: selectedOption.dataset.name,
                phone: selectedOption.dataset.phone,
                address: selectedOption.dataset.address,
                email: selectedOption.dataset.email,
                seri: selectedOption.dataset.seri,
            };
        }

        const warehouseId = createExportBillForm['export-warehouse-id'].value;
        const note = createExportBillForm['export-note'].value;

        const products = [];
        let hasProductError = false;
        document.querySelectorAll('.export-product-entry').forEach(entry => {
            const productId = entry.querySelector('.export-product-id').value;
            const quantity = parseInt(entry.querySelector('.export-product-quantity').value);
            const price = parseFloat(entry.querySelector('.export-product-selling-price').value);

            const selectedOption = entry.querySelector('.export-product-id').options[entry.querySelector('.export-product-id').selectedIndex];
            const maxQty = parseInt(selectedOption.dataset.maxQty);
            
            if (quantity > maxQty) {
                alert(`Lỗi: Số lượng cho ${selectedOption.dataset.name} (${quantity}) vượt quá tồn kho có sẵn (${maxQty}).`);
                hasProductError = true;
                return;
            }

            if (productId && quantity > 0 && price > 0) {
                products.push({
                    warehouseProductId: productId,
                    quantity: quantity,
                    price: price
                });
            } else {
                alert('Vui lòng đảm bảo tất cả sản phẩm đã chọn có số lượng và giá bán hợp lệ.');
                hasProductError = true;
            }
        });

        if (hasProductError) {
            return;
        }

        try {
            const response = await createExportBill({ customerDetails, products, note, warehouseId });
            alert('Hóa đơn xuất đã được tạo thành công! Mã: ' + response.code);
            createExportBillForm.reset();
            exportProductsContainer.innerHTML = '<p class="product-select-container">Chọn một kho để xem sản phẩm có sẵn.</p>';
            selectedWarehouseProducts = [];
            exportProductCounter = 0;
            await loadWarehousesForExport();
            addExportBillModal.style.display = 'none';
            renderExportBills();
        } catch (error) {
            alert('Lỗi khi tạo hóa đơn xuất: ' + error.message);
        }
    });

    // Render Export Bills List
    const renderExportBills = async () => {
        exportBillsTableBody.innerHTML = '';
        if (!canViewExportBills) {
            exportBillMessage.textContent = 'Bạn không có quyền xem hóa đơn xuất.';
            return;
        }
        try {
            allExportBills = await getAllExportBills();
            if (allExportBills.length === 0) {
                exportBillMessage.textContent = 'Không có hóa đơn xuất nào được tìm thấy.';
                if (exportTimeChartInstance) exportTimeChartInstance.destroy();
                if (exportProductQuantityChartInstance) exportProductQuantityChartInstance.destroy();
                timeChartStatus.textContent = 'Không có dữ liệu để tạo biểu đồ.';
                productChartStatus.textContent = 'Không có dữ liệu để tạo biểu đồ.';
                return;
            }

            allExportBills.forEach(bill => {
                const row = exportBillsTableBody.insertRow();
                row.insertCell().textContent = bill.code;
                row.insertCell().textContent = new Date(bill.date).toLocaleDateString();
                row.insertCell().textContent = bill.customerInfo ? bill.customerInfo.name : (bill.customer ? bill.customer.name : 'N/A');
                row.insertCell().textContent = bill.staff ? bill.staff.username : 'N/A';
                row.insertCell().textContent = bill.products.length;
                row.insertCell().textContent = bill.note || '';

                const actionsCell = row.insertCell();
                const viewDetailsBtn = document.createElement('button');
                viewDetailsBtn.textContent = 'Xem chi tiết';
                viewDetailsBtn.addEventListener('click', () => showExportBillDetails(bill));
                actionsCell.appendChild(viewDetailsBtn);
            });
            updateAllCharts();
        } catch (error) {
            exportBillMessage.textContent = `Lỗi khi tải hóa đơn xuất: ${error.message}`;
            console.error('Lỗi khi tải hóa đơn xuất:', error);
            if (exportTimeChartInstance) exportTimeChartInstance.destroy();
            if (exportProductQuantityChartInstance) exportProductQuantityChartInstance.destroy();
            timeChartStatus.textContent = 'Lỗi khi tải dữ liệu cho biểu đồ.';
            productChartStatus.textContent = 'Lỗi khi tải dữ liệu cho biểu đồ.';
        }
    };

    // Show Export Bill Details in Modal
    const showExportBillDetails = (bill) => {
        currentViewingExportBillId = bill._id;

        billDetailCode.textContent = bill.code;
        billDetailDate.textContent = new Date(bill.date).toLocaleDateString();
        billDetailCustomerName.textContent = bill.customerInfo ? bill.customerInfo.name : 'N/A';
        billDetailCustomerPhone.textContent = bill.customerInfo ? bill.customerInfo.phone : 'N/A';
        billDetailCustomerAddress.textContent = bill.customerInfo ? bill.customerInfo.address : 'N/A';
        billDetailStaffName.textContent = bill.staff ? bill.staff.username : 'N/A';
        billDetailNote.textContent = bill.note || 'N/A';
        billDetailProductsList.innerHTML = '';

        if (bill.products && bill.products.length > 0) {
            noProductsInBillMessage.style.display = 'none';
            bill.products.forEach(product => {
                const li = document.createElement('li');
                li.className = 'detail-product-item';
                li.innerHTML = `
                    <strong>${product.name}</strong><br>
                    Mã HĐ nhập liên quan: ${product.codeImportBill || 'N/A'}<br>
                    Loại: ${product.type || 'N/A'}<br>
                    Mô tả: ${product.description || 'N/A'}<br>
                    Số lượng: ${product.quantity}<br>
                    Giá bán: ${formatCurrencyVND(product.price)}<br>
                    Giá nhập tại thời điểm xuất: ${formatCurrencyVND(product.importPriceAtExport)}<br>
                    Giá xuất mặc định tại thời điểm xuất: ${formatCurrencyVND(product.exportPriceAtExport)}
                `;
                billDetailProductsList.appendChild(li);
            });
        } else {
            noProductsInBillMessage.style.display = 'block';
        }

        if (canUpdateExportBill) {
            detailEditExportButton.style.display = 'inline-block';
        } else {
            detailEditExportButton.style.display = 'none';
        }
        if (canDeleteExportBill) {
            detailDeleteExportButton.style.display = 'inline-block';
        } else {
            detailDeleteExportButton.style.display = 'none';
        }
        
        viewExportBillDetailsModal.style.display = 'flex';
    };

    detailEditExportButton.addEventListener('click', () => {
        if (currentViewingExportBillId) {
            alert('Chức năng Sửa hóa đơn xuất (ID: ' + currentViewingExportBillId + ') sẽ được mở ra để chỉnh sửa. (Chưa triển khai chi tiết)');
        }
    });

    detailDeleteExportButton.addEventListener('click', async () => {
        if (currentViewingExportBillId && confirm(`Bạn có chắc chắn muốn xóa hóa đơn xuất này (ID: ${currentViewingExportBillId})?`)) {
            try {
                await deleteExportBill(currentViewingExportBillId);
                alert('Hóa đơn xuất đã được xóa thành công!');
                viewExportBillDetailsModal.style.display = 'none';
                renderExportBills();
            } catch (error) {
                alert('Lỗi khi xóa hóa đơn xuất: ' + error.message);
            }
        }
    });

    // Initial setup and render
    setupYearSelect();
    renderExportBills();
});