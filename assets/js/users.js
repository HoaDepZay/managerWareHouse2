document.addEventListener('DOMContentLoaded', async () => {
    // Sửa đường dẫn redirect
    checkAuthAndRedirect('admin', '../index/login_register.html');
    displayWelcomeMessage();
    document.getElementById('logout-button').addEventListener('click', logout);

    // UI elements
    const usersTableBody = document.querySelector('#users-table tbody');
    const userMessage = document.getElementById('user-message');

    // Modal elements
    const assignPermissionsModal = document.getElementById('assign-permissions-modal');
    const closeButtons = document.querySelectorAll('.modal .close-button'); // Nút đóng chung
    const staffUsernameToAssign = document.getElementById('staff-username-to-assign');
    const permissionsCheckboxContainer = document.getElementById('permissions-checkbox-container');
    const assignPermissionsForm = document.getElementById('assign-permissions-form');
    const cancelAssignPermissionsBtn = document.getElementById('cancel-assign-permissions');

    let currentUserIdToAssign = null; // Biến để lưu ID người dùng đang được cấp quyền

    // Danh sách tất cả các quyền có thể có (admin định nghĩa)
    // Cần khớp với các quyền bạn đã kiểm tra trong middleware hasPermission
    const availablePermissions = [
        'viewCustomers',
        'createImportBill', 'viewImportBills', 'updateImportBill', 'deleteImportBill',
        'createExportBill', 'viewExportBills', 'updateExportBill', 'deleteExportBill',
        'createWarehouse', 'viewWarehouses', 'updateWarehouse', 'deleteWarehouse'
    ];

    // Functions to open/close modal
    const openAssignPermissionsModal = (userId, username, currentPermissions) => {
        currentUserIdToAssign = userId;
        staffUsernameToAssign.textContent = username;
        permissionsCheckboxContainer.innerHTML = ''; // Clear previous checkboxes

        availablePermissions.forEach(permission => {
            const div = document.createElement('div');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `perm-${permission}`;
            checkbox.name = 'permission';
            checkbox.value = permission;
            
            // Đánh dấu quyền hiện tại của staff
            if (currentPermissions.includes(permission)) {
                checkbox.checked = true;
            }

            const label = document.createElement('label');
            label.htmlFor = `perm-${permission}`;
            label.textContent = permission;

            div.appendChild(checkbox);
            div.appendChild(label);
            permissionsCheckboxContainer.appendChild(div);
        });

        assignPermissionsModal.style.display = 'flex'; // Use flex to center
    };

    const closeAssignPermissionsModal = () => {
        assignPermissionsModal.style.display = 'none';
        assignPermissionsForm.reset(); // Reset form
        currentUserIdToAssign = null;
    };

    // Event Listeners for modal close buttons
    closeButtons.forEach(button => {
        button.addEventListener('click', closeAssignPermissionsModal);
    });

    cancelAssignPermissionsBtn.addEventListener('click', closeAssignPermissionsModal);

    window.addEventListener('click', (event) => {
        if (event.target == assignPermissionsModal) {
            closeAssignPermissionsModal();
        }
    });

    // Handle Assign Permissions Form Submission
    assignPermissionsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUserIdToAssign) {
            alert('Lỗi: Không tìm thấy ID người dùng để cấp quyền.');
            return;
        }

        const selectedPermissions = [];
        permissionsCheckboxContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
            selectedPermissions.push(checkbox.value);
        });

        try {
            const response = await assignStaffPermissions(currentUserIdToAssign, selectedPermissions);
            alert(response.message);
            closeAssignPermissionsModal();
            renderUsers(); // Re-render table to show updated permissions
        } catch (error) {
            alert('Lỗi khi cấp quyền: ' + error.message);
            console.error('Error assigning permissions:', error);
        }
    });


    // Render Users Table
    const renderUsers = async () => {
        usersTableBody.innerHTML = '';
        try {
            const users = await getPendingApprovals(); // Lấy tất cả user (admin và staff)

            if (users.length === 0) {
                userMessage.textContent = 'Không có tài khoản nhân viên hoặc quản trị viên nào để quản lý.';
                return;
            }

            userMessage.textContent = ''; // Clear previous messages

            users.forEach(user => {
                const row = usersTableBody.insertRow();
                row.insertCell().textContent = user.username || 'N/A';
                row.insertCell().textContent = user.email || 'N/A';
                row.insertCell().textContent = user.role;
                row.insertCell().textContent = user.approved ? 'Yes' : 'No';
                row.insertCell().textContent = user.department || 'N/A';
                
                const permissionsCell = row.insertCell();
                const userPermissions = (user.permissions && Array.isArray(user.permissions)) ? user.permissions : [];
                permissionsCell.textContent = userPermissions.length > 0 ? userPermissions.join(', ') : 'None';

                const actionsCell = row.insertCell();
                if (user.role === 'staff') { // Chỉ cho phép cấp quyền cho staff
                    const assignBtn = document.createElement('button');
                    assignBtn.textContent = 'Cấp Quyền';
                    assignBtn.addEventListener('click', () => {
                        openAssignPermissionsModal(user._id, user.username || user.email, userPermissions);
                    });
                    actionsCell.appendChild(assignBtn);
                } else {
                    actionsCell.textContent = 'N/A';
                }
            });
        } catch (error) {
            userMessage.textContent = `Lỗi khi tải danh sách người dùng: ${error.message}`;
            console.error('Lỗi khi tải danh sách người dùng:', error);
        }
    };

    renderUsers(); // Initial load of users
});