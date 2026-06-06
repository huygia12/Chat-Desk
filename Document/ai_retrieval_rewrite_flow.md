# Luong selective LLM rewrite cho AI tra loi khach hang

## Muc tieu

Luong nay cai thien viec AI tu dong tra loi khach hang trong cac cau hoi follow-up ngan hoac mo ho, vi du: "Co", "Gia sao?", "Mau bac con khong?", "Cai thu hai thi sao?". Van giu performance bang cach chi goi LLM rewrite khi search bang tin nhan hien tai khong du tin cay.

## Luong da trien khai

1. Backend nhan tin nhan moi nhat cua khach qua webhook hoac widget.
2. `generate_ai_response()` duoc goi voi `conversation` va `user_message`.
3. Backend chay song song:
   - Lay chat history gan nhat tu PostgreSQL.
   - Tao embedding cho `user_message` va search Milvus bang tin nhan hien tai.
4. Danh gia ket qua current search bang:
   - `AI_RETRIEVAL_HIGH_CONFIDENCE_THRESHOLD`
   - `AI_RETRIEVAL_SCORE_MARGIN` hoac co nhieu ket qua cung vuot `AI_RETRIEVAL_MIN_SCORE`
   - `AI_RETRIEVAL_MIN_MESSAGE_LENGTH`
5. Neu current search du tin cay:
   - Dung product context tu current search.
   - Khong goi LLM rewrite.
   - Log: `Customer AI current product search accepted...`
6. Neu current search khong du tin cay:
   - Dung history da lay song song.
   - Goi LLM rewrite de tao `standalone_query`.
   - LLM rewrite chi tra JSON gom `standalone_query`, `uses_context`, `confidence`.
   - Neu confidence du nguong, search Milvus lai bang `standalone_query`.
   - Log: `Customer AI using rewritten product query...`
7. Sau moi duong retrieval, loc product context cuoi bang `AI_RETRIEVAL_MIN_SCORE`.
8. Neu Milvus/current search/rewrite search loi:
   - Khong fallback sang danh sach san pham moi nhat.
   - Product context de trong.
   - Prompt yeu cau AI noi rang khong tim thay du lieu san pham phu hop trong he thong.
   - Log: `Customer AI has no product context... because product search failed`
9. Build prompt cuoi gom:
   - Business context.
   - Product search query da dung.
   - Product context neu co.
   - Chat history.
   - Tin nhan hien tai neu history chua chua no.
10. Goi LLM provider hien tai de tao cau tra loi gui cho khach.

## Ly do chay history song song voi current search

History van can cho prompt tra loi cuoi va can cho nhanh LLM rewrite. De giam latency, backend bat dau lay history cung luc voi embedding + Milvus search cua current message.

Luu y ky thuat: khong chay nhieu query PostgreSQL song song tren cung `AsyncSession`. Phan chay song song voi history la embedding + Milvus search, khong dung SQL session. Sau khi co product IDs/scores tu Milvus, backend moi fetch product rows tu PostgreSQL.

## Thresholds cau hinh

Cac cau hinh nam trong `backend/app/config.py`:

- `AI_REWRITE_ENABLED`: bat/tat LLM rewrite.
- `AI_REWRITE_CONFIDENCE_THRESHOLD`: confidence toi thieu cua rewrite.
- `AI_REWRITE_TIMEOUT_SECONDS`: timeout cho lan goi rewrite.
- `AI_RETRIEVAL_HIGH_CONFIDENCE_THRESHOLD`: top score toi thieu de tin current search.
- `AI_RETRIEVAL_MIN_SCORE`: score toi thieu de dua product vao prompt cuoi.
- `AI_RETRIEVAL_SCORE_MARGIN`: khoang cach toi thieu giua top1 va top2.
- `AI_RETRIEVAL_MIN_MESSAGE_LENGTH`: do dai message toi thieu de skip rewrite khi score tot.

Gia tri mac dinh hien tai:

```env
AI_REWRITE_ENABLED=true
AI_REWRITE_CONFIDENCE_THRESHOLD=0.6
AI_REWRITE_TIMEOUT_SECONDS=2.0
AI_RETRIEVAL_HIGH_CONFIDENCE_THRESHOLD=0.58
AI_RETRIEVAL_MIN_SCORE=0.55
AI_RETRIEVAL_SCORE_MARGIN=0.05
AI_RETRIEVAL_MIN_MESSAGE_LENGTH=12
```

## Cac file lien quan

- `backend/app/services/ai_service.py`
  - Chua luong selective rewrite, scoring, logging va prompt cuoi.
- `backend/app/services/milvus_service.py`
  - Them `search_similar_with_scores()` de tra `id + score`.
- `backend/app/config.py`
  - Them cac bien cau hinh threshold/rewrite.

## Hanh vi khi Milvus loi

Theo yeu cau, khi Milvus loi, he thong khong lay fallback cac san pham moi nhat nua. Thay vao do:

- Log loi retrieval.
- Khong dua product context vao prompt.
- LLM duoc yeu cau tra loi lich su rang khong tim thay du lieu san pham phu hop trong he thong.

Dieu nay tranh viec AI lay san pham khong lien quan va tra loi sai.
