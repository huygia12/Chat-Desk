# Tổng hợp đánh giá AI ChatDesk

Lượt đánh giá gần nhất: `Document/ai_evaluation_run_20260529_030241`

## Phạm vi

- Backend: `http://localhost:8000`
- Business test: `codex-ai-eval-run-20260529030241@example.com`
- Tổng lượt chấm: `42`
- Số lần lặp mỗi kịch bản: `3`
- Tính năng được đánh giá:
  - AI tự động trả lời khách hàng.
  - AI trợ lý ảo hỗ trợ nhân viên.

## Kết quả chính

| Nhóm | Runs | Điểm trung bình | Pass rate >= 4 | Latency trung bình |
|---|---:|---:|---:|---:|
| Tổng thể | 42 | 4.96 / 5 | 97.62% | 5312.07 ms |
| AI tự động trả lời | 24 | 5.00 / 5 | 100.00% | 2582.04 ms |
| AI trợ lý ảo | 18 | 4.91 / 5 | 94.44% | 8952.11 ms |

## Nhất quán ngữ nghĩa

Các nhóm kiểm thử cùng nghĩa nhưng diễn đạt khác nhau đều đạt `100%` theo kiểm tra facts tự động:

- `nova_price_stock`
- `nova_price`
- `nova_stock`
- `nova_policy`
- `slim_stock`
- `assistant_nova_facts`

Không ghi nhận mâu thuẫn về giá, tồn kho hoặc chính sách trong các nhóm này.

## Điểm cần chú ý

Có 1 lượt dưới ngưỡng 4 điểm:

- `ASSIST-ESC-01`, repeat 1, score `3.33 / 5`.
- Tình huống: khách nhận balo bị lỗi và muốn hoàn tiền ngay.
- Phản hồi đúng chính sách và hướng xử lý chung, nhưng thiếu tín hiệu đồng cảm/xin lỗi theo checklist escalation.

## File output

- `Document/ai_evaluation_run_20260529_030241/report.md`: báo cáo chi tiết.
- `Document/ai_evaluation_run_20260529_030241/summary.json`: tổng hợp machine-readable.
- `Document/ai_evaluation_run_20260529_030241/summary.csv`: bảng kết quả từng lượt.
- `Document/ai_evaluation_run_20260529_030241/raw_results.json`: input/output thô để audit thủ công.

## Kết luận sơ bộ

AI tự động trả lời đang đạt tốt trên dataset test nhỏ: đúng facts, không mâu thuẫn giữa các paraphrase, xử lý được dữ liệu thiếu và yêu cầu nhạy cảm cơ bản.

AI trợ lý ảo cũng đạt tốt về facts và nhất quán, nhưng nên cải thiện prompt escalation để luôn có bước xin lỗi/đồng cảm khi khách khiếu nại hoặc yêu cầu hoàn tiền.
