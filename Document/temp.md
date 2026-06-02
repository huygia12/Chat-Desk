Bạn nên đánh giá chatbot theo 2 nhóm lớn: **chất lượng trả lời** và **chất lượng hệ thống**. Với báo cáo đồ án, mình khuyên chọn khoảng 6-8 tiêu chí là đẹp, đủ học thuật mà không quá nặng.

**Các khía cạnh nên đánh giá**

| Tiêu chí                             | Nên đo gì                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| Độ chính xác câu trả lời             | Chatbot trả lời đúng nội dung người dùng hỏi không                                |
| Nhận diện ý định                     | Hiểu đúng intent như hỏi thông tin, đặt lịch, tra cứu, khiếu nại...               |
| Mức độ đầy đủ                        | Câu trả lời có đủ thông tin cần thiết không                                       |
| Tính tự nhiên                        | Câu trả lời có dễ hiểu, thân thiện, giống hội thoại thật không                    |
| Khả năng xử lý câu hỏi ngoài phạm vi | Khi không biết thì có từ chối/đề xuất hướng xử lý hợp lý không                    |
| Khả năng xử lý lỗi nhập liệu         | Viết sai chính tả, câu mơ hồ, thiếu thông tin                                     |
| Thời gian phản hồi                   | Chatbot phản hồi nhanh hay chậm                                                   |
| Tính ổn định đa kênh                 | Nếu đồ án là omni-channel, nên kiểm tra trên web/mobile/Zalo/Facebook/etc. nếu có |

Nếu chatbot của bạn có dùng dữ liệu nội bộ hoặc RAG, nên thêm 2 tiêu chí rất đáng giá:

| Tiêu chí           | Ý nghĩa                                                |
| ------------------ | ------------------------------------------------------ |
| Độ bám sát dữ liệu | Trả lời có dựa đúng vào tài liệu/nguồn dữ liệu không   |
| Tỷ lệ ảo giác      | Chatbot có bịa thông tin không có trong hệ thống không |

**Cách triển khai đánh giá**

Bạn nên tạo một **bộ câu hỏi kiểm thử** gồm nhiều tình huống khác nhau. Ví dụ:

1. Câu hỏi bình thường, rõ ràng.  
   Ví dụ: “Làm sao để đăng ký tài khoản?”

2. Câu hỏi có nhiều cách diễn đạt.  
   Ví dụ: “Tôi muốn tạo acc”, “Đăng ký như nào?”, “Mở tài khoản mới ở đâu?”

3. Câu hỏi thiếu thông tin.  
   Ví dụ: “Tôi muốn đặt lịch” nhưng chưa nói ngày/giờ.

4. Câu hỏi sai chính tả.  
   Ví dụ: “toi muon doi mat khau”, “quên mật khâu thì làm sao?”

5. Câu hỏi ngoài phạm vi.  
   Ví dụ chatbot bán hàng nhưng người dùng hỏi “Dự báo thời tiết hôm nay?”

6. Hội thoại nhiều lượt.  
   Ví dụ người dùng hỏi sản phẩm, hỏi tiếp giá, rồi hỏi cách thanh toán.

Mỗi câu trả lời nên được chấm theo thang điểm, ví dụ:

| Điểm | Ý nghĩa                          |
| ---- | -------------------------------- |
| 5    | Hoàn toàn đúng, đầy đủ, tự nhiên |
| 4    | Đúng nhưng thiếu chi tiết nhỏ    |
| 3    | Đúng một phần                    |
| 2    | Sai nhiều hoặc trả lời mơ hồ     |
| 1    | Sai hoàn toàn                    |
| 0    | Không trả lời hoặc lỗi hệ thống  |

Sau đó tính điểm trung bình cho từng tiêu chí:

```text
Điểm trung bình = Tổng điểm các lần thử / Số lần thử
Tỷ lệ thành công = Số câu đạt từ 4 điểm trở lên / Tổng số câu thử
```

**Nên thử ít nhất bao nhiêu lần?**

Mức tối thiểu hợp lý cho báo cáo đồ án:

| Tiêu chí                   | Số lần thử tối thiểu nên có |
| -------------------------- | --------------------------: |
| Độ chính xác câu trả lời   |               30-50 câu hỏi |
| Nhận diện ý định           |    10-20 câu cho mỗi intent |
| Câu hỏi sai chính tả/mơ hồ |                   15-30 câu |
| Câu hỏi ngoài phạm vi      |                   10-20 câu |
| Hội thoại nhiều lượt       |              10-15 kịch bản |
| Thời gian phản hồi         |              50-100 request |
| Đa kênh                    |     10-20 test cho mỗi kênh |

Nếu đồ án không quá lớn, bạn có thể dùng cấu hình gọn như sau:

```text
Tổng cộng khoảng 100-150 lượt thử nghiệm
- 50 câu hỏi bình thường
- 20 câu hỏi biến thể/cùng ý định
- 20 câu hỏi sai chính tả hoặc thiếu thông tin
- 10 câu hỏi ngoài phạm vi
- 10 hội thoại nhiều lượt
- 50 lần đo thời gian phản hồi
```

Mình nghĩ trong báo cáo bạn nên trình bày thành một chương nhỏ tên là **“Đánh giá hệ thống chatbot”**, gồm: mục tiêu đánh giá, bộ dữ liệu kiểm thử, tiêu chí đánh giá, kết quả bảng điểm, nhận xét ưu điểm/hạn chế, và hướng cải thiện. Cách này nhìn rất ra dáng đồ án, không chỉ là “em làm được chatbot” mà còn chứng minh được chatbot hoạt động tốt đến mức nào.
