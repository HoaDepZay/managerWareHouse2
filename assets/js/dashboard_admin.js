document.addEventListener('DOMContentLoaded', async () => {
    // Đảm bảo người dùng đã đăng nhập và có vai trò admin hoặc staff
    // Nếu không, chuyển hướng về trang đăng nhập
    checkAuthAndRedirect(['admin', 'staff'], '../index/login_register.html');
    displayWelcomeMessage();
    document.getElementById('logout-button').addEventListener('click', logout);

    // Lấy thông tin người dùng từ token
    const token = localStorage.getItem('token');
    let userRole = '';
    let userPermissions = [];

    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            userRole = payload.role;
            userPermissions = payload.permissions || [];
        } catch (error) {
            console.error('Lỗi khi giải mã token:', error);
            // Xử lý lỗi token, có thể xóa token và chuyển hướng về đăng nhập
            localStorage.removeItem('token');
            window.location.href = '../index/login_register.html';
            return;
        }
    }

    // Hàm kiểm tra quyền
    const hasPermission = (permission) => {
        if (userRole === 'admin') {
            return true; // Admin có tất cả quyền
        }
        return userPermissions.includes(permission);
    };

    // Hàm xử lý khi không có quyền
    const handleNoPermission = (e) => {
        e.preventDefault(); // Ngăn chặn hành động mặc định (ví dụ: chuyển hướng link)
        alert('Bạn không có quyền truy cập chức năng này. Vui lòng liên hệ quản trị viên để được cấp phép.');
    };

    // Ẩn/hiển thị các mục menu dựa trên quyền
    const navProducts = document.getElementById('nav-products');
    const navWarehouses = document.getElementById('nav-warehouses');
    const navImportBills = document.getElementById('nav-import-bills');
    const navExportBills = document.getElementById('nav-export-bills');
    const navCustomers = document.getElementById('nav-customers');
    const navUsers = document.getElementById('nav-users'); // Chỉ admin mới thấy

    // Định nghĩa các cặp (element, permission_needed, redirect_link_if_allowed)
    const controlledNavItems = [
        { elem: navProducts, permission: 'viewProducts', link: 'products.html' }, // Giả định quyền xem sản phẩm
        { elem: navWarehouses, permission: 'viewWarehouses', link: 'warehouses.html' },
        { elem: navImportBills, permission: 'viewImportBills', link: 'import_bills.html' },
        { elem: navExportBills, permission: 'viewExportBills', link: 'export_bills.html' },
        { elem: navCustomers, permission: 'viewCustomers', link: 'customers.html' },
        { elem: navUsers, permission: 'admin', link: 'users.html' } // 'admin' role là một quyền đặc biệt ở đây
    ];

    controlledNavItems.forEach(item => {
        if (item.elem) {
            // Đối với mục "Manage Users", chỉ admin mới thấy
            if (item.permission === 'admin') {
                if (userRole !== 'admin') {
                    item.elem.style.display = 'none';
                }
            } else { // Các quyền khác
                if (!hasPermission(item.permission)) {
                    // Nếu không có quyền, ẩn liên kết và thêm event listener để chặn truy cập
                    item.elem.style.display = 'none';
                    // Nếu bạn muốn hiện liên kết nhưng chặn khi click, bỏ dòng trên và dùng dòng dưới
                    // item.elem.addEventListener('click', handleNoPermission);
                }
            }
        }
    });

    // Xử lý các nút chức năng nhanh trên trang dashboard
    const createProductBtn = document.getElementById('create-product-btn');
    const createWarehouseBtn = document.getElementById('create-warehouse-btn');
    const createImportBillBtn = document.getElementById('create-import-bill-btn');
    const createExportBillBtn = document.getElementById('create-export-bill-btn');

    // Định nghĩa các cặp (button_element, permission_needed, target_page_link_for_redirection)
    const controlledButtons = [
        { elem: createProductBtn, permission: 'createProduct', link: 'products.html?action=create' }, // Giả định quyền 'createProduct'
        { elem: createWarehouseBtn, permission: 'createWarehouse', link: 'warehouses.html?action=create' },
        { elem: createImportBillBtn, permission: 'createImportBill', link: 'import_bills.html' }, // Link tới trang import_bills.html, nơi có nút mở modal
        { elem: createExportBillBtn, permission: 'createExportBill', link: 'export_bills.html' }  // Link tới trang export_bills.html, nơi có nút mở modal
    ];

    controlledButtons.forEach(btnItem => {
        if (btnItem.elem) {
            if (!hasPermission(btnItem.permission)) {
                btnItem.elem.style.display = 'none'; // Ẩn nút nếu không có quyền
            } else {
                // Nếu có quyền, thêm event listener để chuyển hướng
                btnItem.elem.addEventListener('click', () => {
                    // Đối với các nút tạo hóa đơn, chuyển hướng đến trang tương ứng
                    // Trang đó sẽ có nút mở modal tạo hóa đơn
                    window.location.href = btnItem.link;
                });
            }
        }
    });

    // Kiểm tra và hiển thị cảnh báo nếu người dùng staff cố gắng truy cập bằng URL trực tiếp
    // (Lưu ý: phần này đã được bao gồm trong auth.js với checkAuthAndRedirect,
    // nhưng đây là một lớp bảo vệ bổ sung hoặc cho các chức năng không có liên kết rõ ràng)
    // Ví dụ: trên trang dashboard_admin.html, nếu user là staff nhưng không có quyền admin,
    // bạn có thể muốn hiện thông báo chào mừng riêng hoặc một cảnh báo chung.
    if (userRole === 'staff') {
        const adminSpecificSections = document.querySelectorAll('#nav-users, #create-product-btn, #create-warehouse-btn'); // Ví dụ các phần chỉ admin nên thấy
        adminSpecificSections.forEach(section => {
            if (section && section.style.display !== 'none') { // Nếu phần tử không bị ẩn bởi quyền cụ thể
                // Nếu đây là staff, và phần tử này thường chỉ dành cho admin
                // (Đây là logic tùy chỉnh cho dashboard_admin)
                // Hiện tại, chúng ta đã ẩn các nút/liên kết trực tiếp.
                // Nếu bạn muốn một thông báo chung khi staff vào trang admin dashboard, bạn có thể thêm ở đây.
            }
        });
    }

    // Bạn cũng có thể thêm event listener cho các nút/liên kết để ngăn chặn truy cập
    // và hiển thị thông báo nếu chúng không bị ẩn.
    // Ví dụ:
    // (Các liên kết nav đã được xử lý bằng cách ẩn. Nếu bạn muốn hiện nhưng chặn click, hãy làm như sau)
    // if (navProducts && !hasPermission('viewProducts')) {
    //     navProducts.addEventListener('click', handleNoPermission);
    // }
    // if (navWarehouses && !hasPermission('viewWarehouses')) {
    //     navWarehouses.addEventListener('click', handleNoPermission);
    // }
    // ... và tương tự cho các liên kết khác
});