ChatDesk la he thong CRM/chat da kenh cho doanh nghiep.

Chuc nang chinh:
- Chat: xem va tra loi hoi thoai tu Facebook, Instagram, Telegram va Widget website. Co the gui text, emoji, file/anh, xem chi tiet visitor, gan label, gan nguoi phu trach va bat/tat AI tu dong cho tung hoi thoai.
- AI tu dong: tra loi khach hang dua tren thong tin cua hang va danh muc san pham. Nut "AI tu dong" trong header hoi thoai chi anh huong luong tra loi khach hang, khong lien quan den tro ly AI noi bo.
- Tro ly AI noi bo: nut "Tro ly AI" tren header app. Day la noi nhan vien hoi ve san pham, ton kho, cach dung he thong va loi thuong gap. Tro ly nay chi tra loi trong modal, khong tu gui tin ra ngoai.
- Products/San pham: quan ly ten san pham, SKU, danh muc, mo ta, gia, trang thai con hang/het hang, so luong ton kho va extra_info. AI dung du lieu nay de tim va tra loi ve san pham.
- Settings/Thong tin doanh nghiep: quan ly ten cua hang, mo ta, dia chi, gio mo cua, chinh sach van chuyen, bao hanh/doi tra, phuong thuc thanh toan, hotline. AI dung cac thong tin nay lam ngu canh.
- Channels/Kenh ket noi: ket noi Meta OAuth cho Facebook Page va Instagram Professional account, ket noi Telegram bot bang Bot Token, va quan ly cac kenh da ket noi.
- Widgets: tao widget chat website, cau hinh allowed origins, copy ma nhung vao website. Widget chi hoat dong tren domain duoc phep.
- Saved Replies: tao mau cau tra loi nhanh, co the go shortcut bat dau bang "/" trong o chat.
- Labels: tao nhan khach hang va gan vao contact/conversation.
- Assignment: cau hinh phan cong hoi thoai, nhan vien co the bi khoa quyen tu doi assignee neu doanh nghiep bat cau hinh khoa.
- Employees: doanh nghiep tao va quan ly tai khoan nhan vien.

Huong dan loi thuong gap:
- Khong nhan duoc webhook Facebook/Instagram: kiem tra callback URL, verify token, ngrok/API_URL public, subscription fields messages, channel token va log backend.
- Khong gui duoc Facebook/Instagram: kiem tra app role/tester, pages_messaging/instagram permissions, app mode, page access token, nguoi nhan co thuoc pham vi test/review hay khong.
- Khong gui duoc file sang Meta: file URL phai public qua API_URL/ngrok/domain that, robots.txt phai cho Meta user-agent tai /api/files, backend can restart sau khi doi .env API_URL.
- Widget khong hien/khong gui: kiem tra allowed_origins, widget_id/widget_secret, domain dung https va browser console.
- AI tra loi sai/khong tim thay san pham: kiem tra du lieu Products, status, stock_quantity, extra_info, sau khi sua nhieu san pham cu nen rebuild Milvus embeddings.
- Neu can ho tro ky thuat: lien he doi phat trien/quan tri he thong qua email lamkhoi.dev@gmail.com va gui kem business email, thoi diem loi, kenh bi loi, conversation id neu co, anh chup man hinh va log backend.
