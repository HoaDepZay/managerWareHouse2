const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
const app = express();
const port = 3004; // Đang chạy trên cổng 3004
const SECRET = 'your_secret_key'; // Thay bằng key bảo mật thật

// ======= KẾT NỐI DATABASE =======
mongoose.connect('mongodb://admin:strongpassword123@192.168.1.200:27017/Data_manager_products?authSource=admin')
.then(() => console.log('✅ Kết nối MongoDB thành công'))
  .catch((err) => console.error('❌ Lỗi kết nối MongoDB:', err));

// ======= MIDDLEWARE =======
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ======= MONGOOSE MODELS =======
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, sparse: true },
  email:    { type: String, unique: true, sparse: true },
  password: String,
  role:     { type: String, default: 'user' }, // 'user', 'admin', 'staff', 'customer'
  approved: { type: Boolean, default: false }, // Giữ nguyên mặc định là false
  department: String, // chỉ dùng cho staff
  permissions: [{ type: String }] // Mảng các quyền được cấp (ví dụ: 'createImportBill', 'viewWarehouse')
});
const User = mongoose.model('User', userSchema);

// Thêm schema cho admin (collection 'admin')
const adminSchema = new mongoose.Schema({
  username: { type: String, unique: true, sparse: true },
  email:    { type: String, unique: true, sparse: true },
  password: String,
  approved: { type: Boolean, default: false }
});
const Admin = mongoose.model('Admin', adminSchema, 'admin');

// Thêm schema cho staff (collection 'staff')
const staffSchema = new mongoose.Schema({
  username: { type: String, unique: true, sparse: true },
  email:    { type: String, unique: true, sparse: true },
  password: String,
  department: String // Thêm trường department cho staff
});
const Staff = mongoose.model('Staff', staffSchema, 'staff');

// Collection Product vẫn giữ nguyên, nhưng sẽ không được tham chiếu trực tiếp từ ImportBill nữa
const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  quantity: Number,
  type: String,
  description: String
});
const Product = mongoose.model('Product', productSchema);

// Cấu trúc Customer đã được cập nhật: BỎ EMAIL, THÊM orderHistory
const customerSchema = new mongoose.Schema({
    name:    { type: String, required: true },
    phone:   { type: String, unique: true, required: true }, // phone là duy nhất
    address: { type: String },
    seri:    { type: String, unique: true, sparse: true }, // seri là duy nhất (hoặc null/không tồn tại)
    email:   { type: String, unique: true, sparse: true }, // <--- Giữ email là duy nhất VÀ sparse
    createdAt: { type: Date, default: Date.now },
    orderHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ExportBill' }]
});
const Customer = mongoose.model('Customer', customerSchema, 'customer');

// Cấu trúc ImportBill ĐÃ ĐƯỢC CẬP NHẬT: Sản phẩm được nhúng trực tiếp, staffName, và BỎ TRƯỜNG WAREHOUSE
const importBillSchema = new mongoose.Schema({
  code:      { type: String, required: true, unique: true },
  date:      { type: Date, default: Date.now },
  supplier:  { type: String, required: true },
  staffName: { type: String, required: true }, // Đổi từ 'staff' ObjectId sang 'staffName' String
  // warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true }, // ĐÃ BỎ TRƯỜNG WAREHOUSE
  products:  [{ // Sản phẩm được nhúng trực tiếp
    name:        { type: String, required: true },
    type:        { type: String },
    description: { type: String },
    quantity:    { type: Number, required: true },
    price:       { type: Number, required: true } // Giá nhập của sản phẩm này
  }],
  note:      { type: String }
});
const ImportBill = mongoose.model('ImportBill', importBillSchema, 'importBill');

// Cấu trúc ExportBill đã được cập nhật: Tham chiếu Customer, nhúng customerInfo
const exportBillSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  date: { type: Date, default: Date.now },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerInfo: {
      name: { type: String, required: true },
      phone: { type: String },
      address: { type: String }
  },
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  products: [{
    warehouseProductId: { type: mongoose.Schema.Types.ObjectId, required: true }, // <-- Lưu ID của SP con trong kho
    // productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null }, // Có thể giữ nếu bạn có tham chiếu SP gốc
    codeImportBill: { type: String, default: null },
    name: { type: String, required: true }, // <-- Lấy tên từ SP trong kho và nhúng vào đây
    type: { type: String },
    description: { type: String },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true }, // Giá bán ra trong hóa đơn này
    importPriceAtExport: { type: Number, default: null }, // Giá nhập của SP này tại thời điểm xuất
    exportPriceAtExport: { type: Number, default: null }  // Giá xuất mặc định của SP này tại thời điểm xuất
  }],
  note: { type: String }
});
const ExportBill = mongoose.model('ExportBill', exportBillSchema, 'exportBill');
const warehouseSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true }, // Tên kho
  location:    { type: String, required: true },               // Địa chỉ kho
  manager:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Người quản lý kho
  products:    [{
    // Cấu trúc sản phẩm trong kho (luôn là bản nhúng)
    codeImportBill: { type: String }, // Mã hóa đơn nhập kho liên quan
    name:          { type: String, required: true },
    type:          { type: String },
    price:         { type: Number }, // Giá bán lẻ mặc định của SP trong kho (cần được quản lý)
    quantity:      { type: Number, required: true },
    description:   { type: String },
    importPrice:   { type: Number }, // Giá nhập của SP này vào kho
    exportPrice:   { type: Number }  // Giá xuất (có thể giống price hoặc khác)
  }],
  note:        { type: String } // Ghi chú thêm nếu cần
});
const Warehouse = mongoose.model('Warehouse', warehouseSchema, 'warehouse');

// ======= MIDDLEWARE XÁC THỰC =======
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(403).json({ error: 'Không có token' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded; // decoded chứa userId, role, approved, permissions
    next();
  } catch {
    return res.status(403).json({ error: 'Token không hợp lệ' });
  }
}

function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Bạn không có quyền truy cập (yêu cầu quyền Admin).' });
  }
  next();
}

// Middleware kiểm tra quyền cụ thể
function hasPermission(permission) {
  return (req, res, next) => {
    // Admin có tất cả quyền
    if (req.user.role === 'admin') {
      return next();
    }
    // Staff: Kiểm tra nếu có vai trò staff VÀ CÓ QUYỀN cụ thể này.
    if (req.user.role === 'staff' && req.user.permissions && req.user.permissions.includes(permission)) {
      return next();
    }
    return res.status(403).json({ error: `Bạn không có quyền: ${permission}. Vui lòng liên hệ quản trị viên.` });
  };
}

// ======= ROUTES =======

// === Đăng ký User (mặc định là staff, approved: false) ===
app.post('/register', async (req, res) => {
  const { name, gmail, numberphone, password, department } = req.body;
  try {
    if (!password) {
        return res.status(400).json({ error: 'Mật khẩu không được để trống.' });
    }
    if (!gmail) {
        return res.status(400).json({ error: 'Email không được để trống.' });
    }

    if (name) {
      const existing = await User.findOne({ username: name });
      if (existing) return res.status(400).json({ error: 'Tài khoản đã tồn tại' });
    }
    if (gmail) {
      const existingEmail = await User.findOne({ email: gmail });
      if (existingEmail) return res.status(400).json({ error: 'Email đã tồn tại' });
    }
    const hashed = await bcrypt.hash(password, 10);
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpRegisterStore[gmail] = { name, gmail, numberphone, password: hashed, otp, department }; 

    await transporter.sendMail({
      from: '"Admin" <servernodejs26@gmail.com>',
      to: gmail,
      subject: 'Mã xác nhận đăng ký tài khoản',
      text: `Mã xác nhận đăng ký của bạn là: ${otp}\n\nLưu ý: Tài khoản Staff của bạn sẽ cần được quản trị viên cấp quyền sau khi xác minh OTP.`
    });

    res.json({ message: 'Đã gửi mã xác nhận về email. Vui lòng kiểm tra email để xác nhận đăng ký!' });
  } catch (err) {
    console.error('Lỗi khi đăng ký:', err);
    res.status(500).json({ error: 'Lỗi server khi đăng ký' });
  }
});

// === Đăng nhập User (admin, staff, customer) ===
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ error: 'Sai tài khoản' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ error: 'Sai mật khẩu' });
  
  const token = jwt.sign(
    { 
      userId: user._id, 
      username: user.username, // Đã thêm username vào token
      role: user.role, 
      approved: user.approved, 
      permissions: user.permissions || [] 
    },
    SECRET,
    { expiresIn: '1h' }
  );
  res.json({ token });
});

// === Đăng ký Customer ===
app.post('/api/customers/register', async (req, res) => {
  try {
    const { email, password } = req.body; 
    // LƯU Ý: Customer schema giờ không có email, API này có thể cần được chỉnh sửa
    // để phù hợp với schema mới hoặc bỏ nếu không cần đăng ký khách hàng ngoài hóa đơn xuất.
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email đã tồn tại!' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword, role: 'customer' });
    await newUser.save();
    res.status(201).json({ message: 'Đăng ký thành công!' });
  } catch (err) {
    res.status(500).json({ error: 'Đăng ký thất bại!' });
  }
});

// === Đăng nhập Customer xxxxxxxxx ===
app.post('/api/customers/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    // LƯU Ý: Tương tự như đăng ký Customer, API này cũng cần xem xét lại
    // do Customer schema không còn email.
    const user = await User.findOne({ email, role: 'customer' });
    if (!user) return res.status(401).json({ error: 'Email không tồn tại' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Sai mật khẩu' });

    res.json({ message: 'Đăng nhập thành công!' });
  } catch {
    res.status(500).json({ error: 'Đăng nhập thất bại!' });
  }
});

// === Lấy danh sách Customer ===
// API này lấy User có role 'customer' từ collection 'users', không phải collection 'customers' mới.
// === Lấy danh sách Customer ===
// API này sẽ lấy danh sách khách hàng từ collection 'customer' và populate orderHistory.
app.get('/api/customers', authMiddleware, hasPermission('viewCustomers'), async (req, res) => { // Thêm hasPermission
    try {
        const customers = await Customer.find({}) // <--- Thay đổi thành Customer.find()
            .populate({
                path: 'orderHistory', // Populate trường 'orderHistory'
                model: 'ExportBill'   // Chỉ định model là 'ExportBill'
                // Nếu muốn staff trong ExportBill được populate:
                // populate: {
                //     path: 'staff',
                //     model: 'User',
                //     select: 'username'
                // }
            })
            .lean(); // Sử dụng .lean()

        res.json(customers);
    } catch (err) {
        console.error('Lỗi khi lấy danh sách khách hàng:', err);
        res.status(500).json({ error: 'Không thể lấy danh sách khách hàng' });
    }
});
// === Sản phẩm ===
// GET Products - Mọi người dùng đã đăng nhập (admin, staff, customer) đều có thể xem
app.get('/products', authMiddleware, async (req, res) => {
  const products = await Product.find();
  res.json(products);
});

// POST Products - Chỉ admin có quyền
app.post('/products', authMiddleware, isAdmin, async (req, res) => {
  const { name, price, quantity, type, description } = req.body;
  const newProduct = new Product({ name, price, quantity, type, description });
  await newProduct.save();
  res.status(201).json(newProduct);
});

// PUT Products - Chỉ admin có quyền
app.put('/products/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { name, price, quantity, description, type } = req.body;
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      { name, price, quantity, description, type },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    res.json({ message: 'Cập nhật sản phẩm thành công!', ...updated.toObject() });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi cập nhật sản phẩm' });
  }
});

// DELETE Products - Chỉ admin có quyền
app.delete('/products/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Đã xoá sản phẩm' });
  } catch {
    res.status(500).json({ error: 'Lỗi xoá sản phẩm' });
  }
});

// === ĐÃ BỎ API 'approve-user' THEO YÊU CẦU ===
// Lấy danh sách các tài khoản đang chờ duyệt (admin và staff)
app.get('/pending-approvals', authMiddleware, isAdmin, async (req, res) => {
  try {
    const pendingUsers = await User.find({ role: { $in: ['admin', 'staff'] }, approved: false }, '-password');
    res.json(pendingUsers);
  } catch (err) {
    console.error('Lỗi lấy danh sách chờ duyệt:', err);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách tài khoản chờ duyệt' });
  }
});

// === Tìm kiếm sản phẩm ===
// Mọi người dùng đã đăng nhập đều có thể tìm kiếm
app.get('/products/search', authMiddleware, async (req, res) => {
  const { q } = req.query;
  try {
    const products = await Product.find({
      name: { $regex: q || '', $options: 'i' }
    });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tìm kiếm sản phẩm' });
  }
});

// Lưu OTP tạm thời (demo, thực tế nên lưu DB hoặc cache)
const otpStore = {}; // Dùng cho forgot password
const otpRegisterStore = {}; // Dùng cho register verify

// Gửi OTP (demo: trả về luôn, thực tế gửi email)
app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'Email không tồn tại' });
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = otp;

  try {
    await transporter.sendMail({
      from: '"Admin" <servernodejs26@gmail.com>',
      to: email,
      subject: 'Mã xác nhận đặt lại mật khẩu',
      text: `Mã OTP của bạn là: ${otp}`
    });
    res.json({ message: 'Đã gửi mã xác nhận về email!' });
  } catch (err) {
    console.error("Lỗi gửi email quên mật khẩu:", err);
    res.status(500).json({ error: 'Không gửi được email. Vui lòng thử lại.' });
  }
});

// Đặt lại mật khẩu
app.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (otpStore[email] !== otp) return res.status(400).json({ error: 'Mã xác nhận không đúng' });
  const hashed = await bcrypt.hash(newPassword, 10);
  await User.findOneAndUpdate({ email }, { password: hashed });
  delete otpStore[email];
  res.json({ message: 'Đặt lại mật khẩu thành công!' });
});

// === Xác nhận đăng ký và lưu tài khoản staff ===
app.post('/register/verify', async (req, res) => {
  const { gmail, otp } = req.body;
  const record = otpRegisterStore[gmail];

  if (!record || record.otp !== otp) {
    return res.status(400).json({ error: 'Mã xác nhận không đúng hoặc đã hết hạn' });
  }

  try {
    let user = await User.findOne({ email: record.gmail });

    if (!user) {
        user = new User({
            username: record.name,
            email: record.gmail,
            numberphone: record.numberphone,
            password: record.password,
            role: 'staff',
            approved: false,
            department: record.department,
            permissions: []
        });
        await user.save();
    } else {
        user.username = record.name;
        user.email = record.gmail;
        user.numberphone = record.numberphone;
        user.password = record.password;
        user.role = 'staff';
        user.approved = false;
        user.department = record.department;
        user.permissions = user.permissions || [];
        await user.save();
    }

    // Tạo hoặc cập nhật bản ghi trong collection Staff
    let staff = await Staff.findOne({ email: record.gmail });
    if (!staff) {
      staff = new Staff({
        username: record.name,
        email: record.gmail,
        password: record.password,
        department: record.department
      });
      await staff.save();
    } else {
      staff.username = record.name;
      staff.password = record.password;
      staff.department = record.department;
      await staff.save();
    }

    delete otpRegisterStore[gmail];

    res.json({ message: 'Xác nhận đăng ký thành công! Tài khoản của bạn đã được tạo và đang chờ quản trị viên cấp quyền.' });
  } catch (err) {
    console.error('Lỗi khi xác nhận đăng ký:', err);
    res.status(500).json({ error: 'Lỗi server khi xác nhận đăng ký.' });
  }
});

// Route Admin cấp quyền cho Staff
app.post('/admin/assign-permissions/:userId', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Dữ liệu quyền không hợp lệ (phải là mảng).' });
    }

    const userToUpdate = await User.findById(userId);
    if (!userToUpdate) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    }

    if (userToUpdate.role !== 'staff') {
      return res.status(400).json({ error: 'Chỉ có thể cấp quyền cho tài khoản Staff.' });
    }

    userToUpdate.permissions = permissions;
    userToUpdate.approved = true; // THÊM DÒNG NÀY ĐỂ TỰ ĐỘNG DUYỆT TÀI KHOẢN

    await userToUpdate.save();

    res.json({ message: `Đã cập nhật quyền cho người dùng ${userToUpdate.username || userToUpdate.email}. Tài khoản đã được duyệt.`, permissions: userToUpdate.permissions });
  } catch (err) {
    console.error('Lỗi khi cấp quyền:', err);
    res.status(500).json({ error: 'Lỗi server khi cấp quyền.' });
  }
});

// Thêm API này vào file index.js của bạn, cùng với các routes khác
// Ví dụ: Đặt gần các API ExportBill hoặc Warehouse GET

// Đảm bảo API này tồn tại và được cập nhật
app.get('/customers/:id', authMiddleware, hasPermission('viewCustomers'), async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id)
            .populate({
                path: 'orderHistory', // Dòng này quan trọng!
                model: 'ExportBill'
                // Không cần populate thêm cho products bên trong ExportBill vì chúng là nhúng
            })
            .lean(); // Sử dụng .lean() nếu bạn muốn kết quả là POJO

        if (!customer) {
            return res.status(404).json({ error: 'Không tìm thấy khách hàng.' });
        }
        res.json(customer);
    } catch (err) {
        console.error('Lỗi khi lấy thông tin khách hàng chi tiết:', err);
        res.status(500).json({ error: 'Lỗi server khi lấy thông tin khách hàng chi tiết.' });
    }
});

// Hoặc API này nếu bạn muốn list tất cả khách hàng với orderHistory populated
app.get('/api/customers', authMiddleware, hasPermission('viewCustomers'), async (req, res) => {
    try {
        const customers = await Customer.find({})
            .populate({
                path: 'orderHistory', // Dòng này quan trọng!
                model: 'ExportBill'
            })
            .lean();
        res.json(customers);
    } catch (err) {
        console.error('Lỗi khi lấy danh sách khách hàng:', err);
        res.status(500).json({ error: 'Không thể lấy danh sách khách hàng' });
    }
});

// === ExportBill APIs ===
// GET ExportBills - Đã sửa lỗi populate
app.get('/exportbills', authMiddleware, hasPermission('viewExportBills'), async (req, res) => {
    try {
        // Thêm .sort({ date: -1 }) để sắp xếp giảm dần theo ngày tạo (cái mới nhất lên đầu)
        const bills = await ExportBill.find().populate('customer').populate('staff').sort({ date: -1 });
        res.json(bills);
    } catch (err) {
        console.error('Lỗi khi lấy danh sách hóa đơn xuất:', err);
        res.status(500).json({ error: 'Lỗi khi lấy danh sách hóa đơn xuất.' });
    }
});

// GET ExportBill by ID - Đã sửa lỗi populate
app.get('/exportbills/:id', authMiddleware, hasPermission('viewExportBills'), async (req, res) => {
    try {
        // Bỏ populate('products.product') vì products là subdocument nhúng trực tiếp
        const bill = await ExportBill.findById(req.params.id).populate('customer').populate('staff');
        if (!bill) return res.status(404).json({ error: 'Không tìm thấy hóa đơn xuất.' });
        res.json(bill);
    } catch (err) {
        console.error('Lỗi khi lấy hóa đơn xuất:', err);
        res.status(500).json({ error: 'Lỗi khi lấy hóa đơn xuất.' });
    }
});

// API POST /exportbills đã được cập nhật
app.post('/exportbills', authMiddleware, hasPermission('createExportBill'), async (req, res) => {
    try {
        // --- 1. Khai báo biến đầu hàm (phạm vi toàn bộ try block) ---
        const staffIdFromToken = req.user.userId;
        const { customerDetails, products, note, warehouseId } = req.body;
        const code = generateBillCode();

        let customerToAssociate = null; 
        let customerDataForBill = {};
        const productsForExportBill = []; // <--- ĐẢM BẢO DÒNG NÀY Ở ĐÂY VÀ KHÔNG BỊ XOÁ!


        // --- 2. Bắt đầu logic xử lý khách hàng ---
        if (!customerDetails || !customerDetails.phone) {
            return res.status(400).json({ error: 'Thông tin khách hàng (đặc biệt là số điện thoại) không được để trống.' });
        }
        if (!customerDetails.name) {
            return res.status(400).json({ error: 'Tên khách hàng không được để trống.' });
        }

        let existingCustomer = await Customer.findOne({ phone: customerDetails.phone });

        if (existingCustomer) {
            let customerInfoChanged = false;

            if (customerDetails.name && existingCustomer.name !== customerDetails.name) {
                existingCustomer.name = customerDetails.name;
                customerInfoChanged = true;
            }
            if (customerDetails.address && existingCustomer.address !== customerDetails.address) {
                existingCustomer.address = customerDetails.address;
                customerInfoChanged = true;
            }
            if (customerDetails.seri && existingCustomer.seri !== customerDetails.seri) {
                existingCustomer.seri = customerDetails.seri;
                customerInfoChanged = true;
            }

            if (customerDetails.email) {
                if (existingCustomer.email && existingCustomer.email !== customerDetails.email) {
                    const customerWithNewEmail = await Customer.findOne({ email: customerDetails.email });
                    if (customerWithNewEmail && !customerWithNewEmail._id.equals(existingCustomer._id)) {
                        return res.status(400).json({ error: `Địa chỉ email '${customerDetails.email}' đã được sử dụng bởi khách hàng khác.` });
                    }
                    existingCustomer.email = customerDetails.email;
                    customerInfoChanged = true;
                } else if (!existingCustomer.email) {
                    const customerWithNewEmail = await Customer.findOne({ email: customerDetails.email });
                     if (customerWithNewEmail) {
                        return res.status(400).json({ error: `Địa chỉ email '${customerDetails.email}' đã được sử dụng bởi khách hàng khác.` });
                    }
                    existingCustomer.email = customerDetails.email;
                    customerInfoChanged = true;
                }
            } else if (existingCustomer.email && customerDetails.email === undefined) {
                // Giữ nguyên email cũ nếu không gửi email mới từ request
            }
            
            if (customerInfoChanged || (customerDetails.email && existingCustomer.email !== customerDetails.email) || (!existingCustomer.email && customerDetails.email) ) {
                try {
                    await existingCustomer.save();
                    console.log(`Đã cập nhật thông tin cho khách hàng cũ: ${existingCustomer.name} (${existingCustomer.phone})`);
                } catch (saveErr) {
                    if (saveErr.code === 11000 && saveErr.keyPattern && saveErr.keyPattern.email === 1) {
                        return res.status(400).json({ error: `Địa chỉ email '${saveErr.keyValue.email}' đã tồn tại cho khách hàng khác.` });
                    }
                    throw saveErr;
                }
            } else {
                console.log(`Khách hàng cũ: ${existingCustomer.name} (${existingCustomer.phone}) đã tồn tại, không có thông tin nào cần cập nhật.`);
            }
            customerToAssociate = existingCustomer;

        } else {
            const newCustomerData = {
                name: customerDetails.name,
                phone: customerDetails.phone,
                address: customerDetails.address,
                seri: customerDetails.seri,
            };
            if (customerDetails.email) {
                newCustomerData.email = customerDetails.email;
            }

            const newCustomer = new Customer(newCustomerData);
            try {
                await newCustomer.save();
                customerToAssociate = newCustomer;
                console.log(`Đã tạo khách hàng mới: ${newCustomer.name} (${newCustomer.phone})`);
            } catch (saveErr) {
                if (saveErr.code === 11000) {
                    let duplicateField = Object.keys(saveErr.keyPattern)[0];
                    if (duplicateField === 'phone') {
                        return res.status(400).json({ error: `Số điện thoại '${saveErr.keyValue.phone}' đã tồn tại cho khách hàng khác.` });
                    } else if (duplicateField === 'email') {
                        return res.status(400).json({ error: `Địa chỉ email '${saveErr.keyValue.email}' đã tồn tại cho khách hàng khác.` });
                    }
                }
                throw saveErr;
            }
        }

        customerDataForBill = {
            name: customerDetails.name,
            phone: customerDetails.phone,
            address: customerDetails.address
            // Nếu muốn email trong snapshot, thêm: email: customerDetails.email || null
        };
        // --- Kết thúc logic xử lý khách hàng ---


        // --- 3. Bắt đầu logic xử lý kho hàng và sản phẩm (kiểm tra kỹ các dòng này!) ---
        if (!warehouseId) {
            return res.status(400).json({ error: 'Vui lòng cung cấp ID kho xuất hàng.' });
        }

        // DÒNG NÀY PHẢI LUÔN CÓ VÀ ĐƯỢC THỰC THI TRƯỚC BẤT KỲ LỆNH NÀO SỬ DỤNG 'warehouse'!
        const warehouse = await Warehouse.findById(warehouseId);
        
        if (!warehouse) {
            return res.status(404).json({ error: 'Không tìm thấy kho để xuất hàng.' });
        }
        
        // KIỂM TRA & CHUẨN BỊ THÔNG TIN SẢN PHẨM TRƯỚC KHI TẠO HÓA ĐƠN
        for (const item of products) {
            if (!item.warehouseProductId || !item.quantity || item.quantity <= 0 || !item.price || item.price <= 0) {
                 return res.status(400).json({ error: `Thông tin sản phẩm không đầy đủ (cần warehouseProductId, số lượng, giá, số lượng > 0, giá > 0).` });
            }

            // DÒNG NÀY LÀ DÒNG GÂY LỖI TRƯỚC ĐÓ. NÓ SẼ HOẠT ĐỘNG KHI 'warehouse' ĐƯỢC ĐỊNH NGHĨA.
            const existingProductInWarehouse = warehouse.products.find( 
                p => p._id && p._id.equals(item.warehouseProductId)
            );

            if (!existingProductInWarehouse) {
                return res.status(400).json({
                    error: `Sản phẩm với ID '${item.warehouseProductId}' không tồn tại trong kho '${warehouse.name}'.`
                });
            }
            if (existingProductInWarehouse.quantity < item.quantity) {
                return res.status(400).json({
                    error: `Không đủ số lượng sản phẩm '${existingProductInWarehouse.name}' (ID: ${item.warehouseProductId}) trong kho '${warehouse.name}'. Tồn kho: ${existingProductInWarehouse.quantity}, Yêu cầu xuất: ${item.quantity}.`
                });
            }

            productsForExportBill.push({
                warehouseProductId: existingProductInWarehouse._id,
                codeImportBill: existingProductInWarehouse.codeImportBill,
                name: existingProductInWarehouse.name,
                type: existingProductInWarehouse.type,
                description: existingProductInWarehouse.description,
                quantity: item.quantity,
                price: item.price,
                importPriceAtExport: existingProductInWarehouse.importPrice,
                exportPriceAtExport: existingProductInWarehouse.exportPrice
            });
        }
        // --- Kết thúc kiểm tra & chuẩn bị sản phẩm ---


        // --- 4. Tạo hóa đơn xuất ---
        const newBill = new ExportBill({
            code,
            customer: customerToAssociate._id,
            customerInfo: customerDataForBill,
            staff: staffIdFromToken,
            products: productsForExportBill,
            note
        });
        await newBill.save();

        // --- 5. Cập nhật orderHistory ---
        if (customerToAssociate) {
             customerToAssociate.orderHistory.push(newBill._id);
             await customerToAssociate.save();
        }

        // --- 6. Cập nhật số lượng sản phẩm trong kho ---
        for (const item of products) {
            const existingProductInWarehouseIndex = warehouse.products.findIndex(
                p => p._id && p._id.equals(item.warehouseProductId)
            );

            if (existingProductInWarehouseIndex > -1) {
                warehouse.products[existingProductInWarehouseIndex].quantity -= item.quantity;
                if (warehouse.products[existingProductInWarehouseIndex].quantity <= 0) {
                    warehouse.products.splice(existingProductInWarehouseIndex, 1);
                }
            }
        }
        await warehouse.save();

        res.status(201).json(newBill);
    } catch (err) {
        console.error('Lỗi tạo hóa đơn xuất:', err);
        if (err.code === 11000) {
            let duplicateField = Object.keys(err.keyPattern)[0];
            let errorMessage = `Dữ liệu bị trùng lặp: ${duplicateField}`;
            if (err.keyValue) {
                errorMessage += ` với giá trị '${err.keyValue[duplicateField]}'`;
            }
            return res.status(400).json({ error: errorMessage });
        }
        if (err.name === 'ValidationError') {
            const errors = Object.keys(err.errors).map(key => `${key}: ${err.errors[key].message}`);
            return res.status(400).json({ error: `Lỗi xác thực dữ liệu: ${errors.join(', ')}`, details: err.message });
        }
        res.status(500).json({ error: 'Lỗi server khi tạo hóa đơn xuất.', details: err.message });
    }
});
app.put('/exportbills/:id', authMiddleware, hasPermission('updateExportBill'), async (req, res) => {
    try {
        const { code, customer, staff, products, note } = req.body;
        const updatedBill = await ExportBill.findByIdAndUpdate(
            req.params.id,
            { code, customer, staff, products, note },
            { new: true }
        );
        if (!updatedBill) return res.status(404).json({ error: 'Không tìm thấy hóa đơn xuất.' });
        res.json(updatedBill);
    } catch (err) {
        console.error('Lỗi cập nhật hóa đơn xuất:', err);
        res.status(500).json({ error: 'Lỗi cập nhật hóa đơn xuất.' });
    }
});

app.delete('/exportbills/:id', authMiddleware, hasPermission('deleteExportBill'), async (req, res) => {
    try {
        await ExportBill.findByIdAndDelete(req.params.id);
        res.json({ message: 'Đã xóa hóa đơn xuất.' });
    } catch (err) {
        console.error('Lỗi xóa hóa đơn xuất:', err);
        res.status(500).json({ error: 'Lỗi xóa hóa đơn xuất.' });
    }
});

// === ImportBill APIs ===
// GET ImportBills: ĐÃ CẬP NHẬT để không populate products.product và populate staffName
app.get('/importbills', authMiddleware, hasPermission('viewImportBills'), async (req, res) => {
    try {
        // Thêm .sort({ date: -1 }) để sắp xếp giảm dần theo ngày tạo (cái mới nhất lên đầu)
        const bills = await ImportBill.find().sort({ date: -1 });
        res.json(bills);
    } catch (err) {
        console.error('Lỗi khi lấy danh sách hóa đơn nhập:', err);
        res.status(500).json({ error: 'Lỗi khi lấy danh sách hóa đơn nhập.' });
    }
});

// GET ImportBill by ID: ĐÃ CẬP NHẬT để không populate products.product và populate staffName
app.get('/importbills/:id', authMiddleware, hasPermission('viewImportBills'), async (req, res) => {
    try {
        const bill = await ImportBill.findById(req.params.id); // Không populate warehouse nữa
        if (!bill) return res.status(404).json({ error: 'Không tìm thấy hóa đơn nhập.' });
        res.json(bill);
    } catch (err) {
        console.error('Lỗi khi lấy hóa đơn nhập:', err);
        res.status(500).json({ error: 'Lỗi khi lấy hóa đơn nhập.' });
    }
});

// POST ImportBills: ĐÃ CẬP NHẬT logic sản phẩm mới, tự động tạo code, staffName, và THÊM LẠI WAREHOUSE ID TỪ REQUEST
app.post('/importbills', authMiddleware, hasPermission('createImportBill'), async (req, res) => {
    try {
        const { supplier, products, note, warehouseId } = req.body; // ĐÃ THÊM LẠI 'warehouseId' VÀO body request
        const code = generateBillCode(); // Tự động tạo mã hóa đơn

        const staffName = req.user.username; 

        // === XỬ LÝ KHO HÀNG DỰA TRÊN warehouseId TỪ REQUEST BODY ===
        if (!warehouseId) {
            return res.status(400).json({ error: 'Vui lòng cung cấp ID kho nhập hàng.' });
        }
        const warehouse = await Warehouse.findById(warehouseId);
        if (!warehouse) {
            return res.status(404).json({ error: `Không tìm thấy kho hàng với ID: ${warehouseId}.` });
        }
        // ==========================================================

        // 1. Kiểm tra sản phẩm có đủ thông tin
        if (!products || !Array.isArray(products) || products.length === 0) {
             return res.status(400).json({ error: 'Danh sách sản phẩm không hợp lệ hoặc trống.' });
        }
        for (const item of products) {
            if (!item.name || !item.quantity || !item.price || item.quantity <= 0 || item.price <= 0) {
                return res.status(400).json({ error: `Thông tin sản phẩm '${item.name || "không tên"}' không đầy đủ (cần tên, số lượng, giá, số lượng > 0, giá > 0).` });
            }
        }

        // 2. Tạo hóa đơn nhập (ĐÃ GÁN WAREHOUSE ID TỪ REQUEST BODY)
        const newBill = new ImportBill({
            code,
            supplier,
            staffName, 
            warehouse: warehouseId, // Gán ID kho từ request
            products, 
            note
        });
        await newBill.save(); 

        // 3. Cập nhật tồn kho trong Warehouse (sử dụng warehouse đã tìm thấy)
        for (const item of products) {
            const existingProductInWarehouseIndex = warehouse.products.findIndex(
                p => p.name === item.name 
            );

            if (existingProductInWarehouseIndex > -1) {
                warehouse.products[existingProductInWarehouseIndex].quantity += item.quantity;
                warehouse.products[existingProductInWarehouseIndex].importPrice = item.price;
                warehouse.products[existingProductInWarehouseIndex].price = item.price; 
                warehouse.products[existingProductInWarehouseIndex].exportPrice = item.price; 
            } else {
                warehouse.products.push({
                    codeImportBill: code, 
                    name:        item.name,
                    type:        item.type || '', 
                    description: item.description || '', 
                    quantity:    item.quantity,
                    importPrice: item.price,
                    price:       item.price, 
                    exportPrice: item.price 
                });
            }
        }
        await warehouse.save(); 

        res.status(201).json(newBill);
    } catch (err) {
        console.error('Lỗi khi tạo hóa đơn nhập:', err);
        if (err.name === 'ValidationError') {
            const errors = Object.keys(err.errors).map(key => `${key}: ${err.errors[key].message}`);
            return res.status(400).json({ error: `Lỗi xác thực dữ liệu: ${errors.join(', ')}`, details: err.message });
        }
        if (err.code === 11000) { 
            let duplicateField = Object.keys(err.keyPattern)[0];
            return res.status(400).json({ error: `Mã hóa đơn nhập đã tồn tại hoặc dữ liệu trùng lặp: ${duplicateField}.`, details: err.message });
        }
        res.status(500).json({ error: 'Lỗi server khi tạo hóa đơn nhập.', details: err.message });
    }
});

app.put('/importbills/:id', authMiddleware, hasPermission('updateImportBill'), async (req, res) => {
    try {
        const { code, supplier, staffName, products, note } = req.body; 
        const updatedBill = await ImportBill.findByIdAndUpdate(
            req.params.id,
            { code, supplier, staffName, products, note }, 
            { new: true }
        );
        if (!updatedBill) return res.status(404).json({ error: 'Không tìm thấy hóa đơn nhập.' });
        res.json(updatedBill);
    } catch (err) {
        console.error('Lỗi cập nhật hóa đơn nhập:', err);
        res.status(500).json({ error: 'Lỗi cập nhật hóa đơn nhập.' });
    }
});

app.delete('/importbills/:id', authMiddleware, hasPermission('deleteImportBill'), async (req, res) => {
    try {
        await ImportBill.findByIdAndDelete(req.params.id);
        res.json({ message: 'Đã xóa hóa đơn nhập.' });
    } catch (err) {
        console.error('Lỗi xóa hóa đơn nhập:', err);
        res.status(500).json({ error: 'Lỗi xóa hóa đơn nhập.' });
    }
});

// === Warehouse APIs ===
app.get('/warehouses', authMiddleware, hasPermission('viewWarehouses'), async (req, res) => {
    try {
        const warehouses = await Warehouse.find().populate('manager');
        res.json(warehouses);
    } catch (err) {
        console.error('Lỗi khi lấy danh sách kho:', err);
        res.status(500).json({ error: 'Lỗi khi lấy danh sách kho.' });
    }
});

app.get('/warehouses/:id', authMiddleware, hasPermission('viewWarehouses'), async (req, res) => {
    try {
        const warehouse = await Warehouse.findById(req.params.id).populate('manager');
        if (!warehouse) return res.status(404).json({ error: 'Không tìm thấy kho.' });
        res.json(warehouse);
    } catch (err) {
        console.error('Lỗi khi lấy kho:', err);
        res.status(500).json({ error: 'Lỗi khi lấy kho.' });
    }
});

app.post('/warehouses', authMiddleware, hasPermission('createWarehouse'), async (req, res) => {
    try {
        const { name, location, manager, products, note } = req.body;
        const newWarehouse = new Warehouse({ name, location, manager, products, note });
        await newWarehouse.save();
        res.status(201).json(newWarehouse);
    } catch (err) {
        console.error('Lỗi tạo kho:', err);
        res.status(500).json({ error: 'Lỗi tạo kho.' });
    }
});

app.put('/warehouses/:id', authMiddleware, hasPermission('updateWarehouse'), async (req, res) => {
    try {
        const { name, location, manager, products, note } = req.body;
        const updatedWarehouse = await Warehouse.findByIdAndUpdate(
            req.params.id,
            { name, location, manager, products, note },
            { new: true }
        );
        if (!updatedWarehouse) return res.status(404).json({ error: 'Không tìm thấy kho.' });
        res.json(updatedWarehouse);
    } catch (err) {
        console.error('Lỗi cập nhật kho:', err);
        res.status(500).json({ error: 'Lỗi cập nhật kho.' });
    }
});

app.delete('/warehouses/:id', authMiddleware, hasPermission('deleteWarehouse'), async (req, res) => {
    try {
        await Warehouse.findByIdAndDelete(req.params.id);
        res.json({ message: 'Đã xóa kho.' });
    } catch (err) {
        console.error('Lỗi xóa kho:', err);
        res.status(500).json({ error: 'Lỗi xóa kho.' });
    }
});


// Cấu hình transporter với tài khoản Gmail (hoặc SMTP khác)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'servernodejs26@gmail.com',
    pass: 'rlqu rrbg evmx fiod'
  }
});

// Hàm tạo mã hóa đơn (không liên quan trực tiếp đến API)
function generateBillCode() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0'); // Giờ (2 chữ số)
  const minutes = String(now.getMinutes()).padStart(2, '0'); // Phút (2 chữ số)
  const day = String(now.getDate()).padStart(2, '0'); // Ngày (2 chữ số)
  const month = String(now.getMonth() + 1).padStart(2, '0'); // Tháng (0-11 nên +1, 2 chữ số)
  const year = now.getFullYear(); // Năm (4 chữ số)

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const randomChar = chars.charAt(Math.floor(Math.random() * chars.length)); // 1 ký tự ngẫu nhiên

  return `${hours}${minutes}${day}${month}${year}${randomChar}`;
}

// ======= KHỞI CHẠY SERVER =======
app.listen(port, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${port}`);
});