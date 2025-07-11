# Sử dụng một hình ảnh Node.js chính thức làm nền tảng
# node:20-alpine là phiên bản Node.js 20 dựa trên Alpine Linux, nhỏ gọn và hiệu quả
FROM node:20-alpine

# Đặt thư mục làm việc bên trong container
# Tất cả các lệnh tiếp theo sẽ chạy trong thư mục này
WORKDIR /app

# Sao chép package.json và package-lock.json vào thư mục làm việc
# Sao chép riêng để tận dụng cơ chế caching của Docker layer
# Nếu chỉ có package.json thay đổi, Docker sẽ không chạy lại npm install
COPY package*.json ./

# Cài đặt các phụ thuộc của ứng dụng
RUN npm install

# Sao chép toàn bộ mã nguồn của ứng dụng vào thư mục làm việc
# Dấu chấm thứ nhất là thư mục hiện tại của máy chủ/máy cục bộ
# Dấu chấm thứ hai là thư mục /app bên trong container
COPY . .

# Mở cổng mà ứng dụng Node.js của bạn lắng nghe bên trong container
# Điều này chỉ thông báo cho Docker rằng cổng này được sử dụng, không phải mở cổng trên máy chủ
EXPOSE 3004

# Lệnh để chạy ứng dụng khi container khởi động
# Đảm bảo bạn có script "start" trong package.json của mình (ví dụ: "start": "node app.js")
CMD [ "npm", "start" ]