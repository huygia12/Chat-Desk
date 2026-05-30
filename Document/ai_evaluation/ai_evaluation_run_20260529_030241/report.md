# Báo cáo đánh giá AI ChatDesk

## 1. Thông tin lượt đánh giá

- Backend: `http://localhost:8000`
- Business test: `codex-ai-eval-run-20260529030241@example.com`
- Business ID: `0efe4ece-a5b9-4f75-95d8-491411c9ce7f`
- Số lần lặp mỗi kịch bản: `3`
- Tổng số lượt chấm: `42`

## 2. Kết quả tổng quan

| Chỉ số | Giá trị |
|---|---:|
| Điểm trung bình | 4.96 / 5 |
| Tỉ lệ đạt từ 4 điểm | 97.62% |
| Error count | 0 |
| Latency trung bình | 5312.07 ms |
| Latency p50 | 2627.5 ms |
| Latency p95 | 10834 ms |

## 3. Theo tính năng

| Tính năng | Runs | Điểm TB | Pass rate >= 4 | Latency TB |
|---|---:|---:|---:|---:|
| ai_assistant | 18 | 4.91 | 94.44% | 8952.11 ms |
| auto_reply | 24 | 5.0 | 100.00% | 2582.04 ms |

## 4. Theo tiêu chí

| Tiêu chí | Runs | Điểm TB | Pass rate >= 4 | Latency TB |
|---|---:|---:|---:|---:|
| accuracy | 9 | 5.0 | 100.00% | 2712.44 ms |
| business_policy | 3 | 5.0 | 100.00% | 2456 ms |
| context_tracking | 3 | 5.0 | 100.00% | 2574 ms |
| decision_support | 3 | 5.0 | 100.00% | 8453.67 ms |
| escalation | 3 | 4.44 | 66.67% | 10308.33 ms |
| missing_data | 6 | 5.0 | 100.00% | 6274.17 ms |
| safety | 6 | 5.0 | 100.00% | 6679.17 ms |
| semantic_consistency | 9 | 5.0 | 100.00% | 5511 ms |

## 5. Nhất quán ngữ nghĩa

| Nhóm | Runs | Điểm TB | Semantic consistency rate | Fact miss/contradiction rate |
|---|---:|---:|---:|---:|
| nova_price_stock | 3 | 5.0 | 100.00% | 0.00% |
| nova_price | 3 | 5.0 | 100.00% | 0.00% |
| nova_stock | 3 | 5.0 | 100.00% | 0.00% |
| nova_policy | 3 | 5.0 | 100.00% | 0.00% |
| slim_stock | 3 | 5.0 | 100.00% | 0.00% |
| assistant_nova_facts | 9 | 5.0 | 100.00% | 0.00% |

## 6. Các lượt dưới ngưỡng 4 điểm

| Scenario | Repeat | Score | Input | Response rút gọn |
|---|---:|---:|---|---|
| ASSIST-ESC-01 | 1 | 3.33 | Khách nói nhận balo bị lỗi và muốn hoàn tiền ngay. Nhân viên nên trả lời và xử lý thế nào? | Chính sách bảo hành/đổi trả của cửa hàng là đổi trả trong 7 ngày nếu sản phẩm lỗi do nhà sản xuất, còn tem và hóa đơn. Nhân viên nên hỏi khách về tình trạng lỗi của balo, thời gian mua hàng và giấy tờ liên quan, sau đ... |

## 7. Nhận xét sơ bộ

- Bộ chấm hiện tại dùng kiểm tra facts/rule tự động, phù hợp để phát hiện sai giá, sai tồn kho, thiếu chính sách, bịa thông tin và vấn đề nhất quán cơ bản.
- Các phản hồi vẫn nên được audit thủ công từ `raw_results.json` để đánh giá văn phong, độ tự nhiên và mức phù hợp thương hiệu.
- Nếu chạy lại với dữ liệu thật, nên giữ nguyên cấu trúc scenario nhưng thay expected facts theo sản phẩm/chính sách của business cần đánh giá.
