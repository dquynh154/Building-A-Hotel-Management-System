Hệ thống Quản Lý Khách Sạn (HMS) là ứng dụng web hỗ trợ quản lý các nghiệp vụ cơ bản của khách sạn như đặt phòng, nhận/trả phòng, quản lý khách hàng, hợp đồng và hóa đơn.  

## Chức năng chính
- Quản lý phòng và loại phòng
- Đặt phòng, nhận phòng và trả phòng
- Quản lý khách hàng
- Quản lý hợp đồng và hóa đơn
- Thanh toán (mô phỏng)
- Chatbot hỗ trợ (mô phỏng)

## Công nghệ sử dụng
Frontend:
- Next.js (React)
- Tailwind CSS

Backend:
- Node.js
- Express.js

Database & khác:
- MySQL
- Prisma ORM


## Cách chạy dự án (Local)

Bước 1: Clone repository  
git clone <repo-url>  
cd hotel-management-system  

Bước 2: Chạy Backend  
cd backend  
npm install  
npx prisma migrate dev  


Tạo file `.env` trong thư mục `backend` và cấu hình các biến môi trường sau:

- `DATABASE_URL`: Chuỗi kết nối MySQL  
- `JWT_SECRET`: Chuỗi bí mật dùng để ký JWT  
- `PORT`: Cổng chạy backend (ví dụ: 3001)

Sau đó chạy:
npm run dev  

Backend chạy tại: http://localhost:3001 

Bước 3: Chạy Frontend  
cd frontend  
npm install  
npm run dev  

Frontend chạy tại: http://localhost:3000  

## Minh họa giao diện hệ thống

### Trang chủ
<p align="center">
  <img src="docs/images/trang chu.png" width="800">
</p>

### Danh sách phòng
<p align="center">
  <img src="docs/images/danh sach phong.png" width="800">
</p>

### Phiếu đặt phòng
<p align="center">
  <img src="docs/images/phieu dat phong.png" width="800">
</p>

### Quản lý
<p align="center">
  <img src="docs/images/quan ly.png" width="800">
</p>

### Chi tiết hợp đồng
<p align="center">
  <img src="docs/images/chi tiet.png" width="800">
</p>

### Đánh giá
<p align="center">
  <img src="docs/images/danh gia.png" width="800">
</p>


