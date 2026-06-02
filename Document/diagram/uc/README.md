# Bộ biểu đồ Use Case hệ thống ChatDesk

Các biểu đồ được dựng dựa trên route frontend (`frontend/src/App.jsx`) và các API backend trong `backend/app/api`.

## Danh sách file
- `00_uc_tong_quat.svg` / `00_uc_tong_quat.puml`: Biểu đồ Use Case tổng quát hệ thống ChatDesk
- `01_uc_xac_thuc_phan_quyen.svg` / `01_uc_xac_thuc_phan_quyen.puml`: Use Case phân rã: Xác thực và phân quyền
- `02_uc_admin_he_thong.svg` / `02_uc_admin_he_thong.puml`: Use Case phân rã: Quản trị hệ thống
- `03_uc_kenh_widget.svg` / `03_uc_kenh_widget.puml`: Use Case phân rã: Quản lý kênh kết nối và Widget
- `04_uc_hoi_thoai_tin_nhan.svg` / `04_uc_hoi_thoai_tin_nhan.puml`: Use Case phân rã: Hội thoại và tin nhắn đa kênh
- `05_uc_ai_chatbot.svg` / `05_uc_ai_chatbot.puml`: Use Case phân rã: AI tự động và Trợ lý AI nội bộ
- `06_uc_san_pham_tri_thuc.svg` / `06_uc_san_pham_tri_thuc.puml`: Use Case phân rã: Quản lý sản phẩm và tri thức AI
- `07_uc_nhan_vien_phan_cong.svg` / `07_uc_nhan_vien_phan_cong.puml`: Use Case phân rã: Nhân viên và phân công hội thoại
- `08_uc_nhan_saved_reply_danh_ba.svg` / `08_uc_nhan_saved_reply_danh_ba.puml`: Use Case phân rã: Nhãn, mẫu trả lời nhanh và danh bạ
- `09_uc_thong_ke_cai_dat.svg` / `09_uc_thong_ke_cai_dat.puml`: Use Case phân rã: Thống kê và cài đặt doanh nghiệp
- `10_uc_widget_khach_hang.svg` / `10_uc_widget_khach_hang.puml`: Use Case phân rã: Widget khách hàng trên website

## Ghi chú

- File `.svg` có thể mở bằng trình duyệt hoặc chèn trực tiếp vào Word.
- File `.puml` là mã nguồn PlantUML để chỉnh sửa hoặc render lại nếu cần.
- Quan hệ `<<include>>` thể hiện chức năng con bắt buộc trong luồng chính; `<<extend>>` thể hiện chức năng mở rộng hoặc điều kiện.
