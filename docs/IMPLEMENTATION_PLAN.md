# MayStudy — hiện trạng và kế hoạch triển khai

Tài liệu này phân biệt **đã có trong source** với **đang muốn làm**. Không lấy một dòng trong prompt rồi tính là feature đã xong nhé.

## V1 hiện tại

1. Frontend tĩnh có màn hình đăng nhập, tạo/xem môn học, thêm/xoá tài liệu, giao diện EN/VI và sáng/tối.
2. API FastAPI nhận PDF tối đa 15 MB, dùng PyMuPDF đọc **text**. PDF scan chỉ có ảnh chưa xử lý được.
3. Text theo trang được chia thành đoạn khoảng 45.000 ký tự; mỗi lượt tạo AI dùng một đoạn và các lượt tạo lại luân phiên qua các đoạn. **Chưa có map/reduce** để tổng hợp toàn bộ PDF dài trong một lượt.
4. Mistral được thử trước (nếu có key), sau đó Gemini theo thứ tự key 1→3 khi gặp **429/rate limit**. Lỗi khác không tự chuyển provider.
5. AI được yêu cầu trả JSON gồm summary, 10 flashcard và 20 câu quiz. Backend kiểm tra cấu trúc câu hỏi/đáp án cơ bản, loại câu lặp gần giống, xáo trộn đáp án rồi mới lưu; **chưa kiểm chứng tính đúng với PDF hoặc source_pages**.
6. PostgreSQL lưu môn học, tên tài liệu, summary, flashcards, questions, text nguồn theo trang và lịch sử câu đã sinh. PDF gốc không được lưu. Dữ liệu cũ không có text nguồn thì phải upload PDF lại để dùng tạo lại. Xoá tài liệu xoá bản ghi và nội dung học tương ứng.
7. Giao diện học có lật flashcard, duyệt toàn bộ quiz và nút ↻ để tạo bộ mới. Nếu AI không tạo đủ câu mới sau ba lượt, bộ cũ được giữ nguyên. Summary đã lưu nhưng chưa có màn hiển thị riêng.
8. Backend có tài khoản admin khởi tạo từ `.env` nếu username chưa tồn tại. Login xác thực mật khẩu, nhưng trạng thái đăng nhập phía frontend chỉ lưu ở `localStorage`; các route dữ liệu **chưa kiểm tra token/session**.

## Ranh giới kiến trúc

```text
frontend/src/features/auth, learning
       ↓ HTTP
backend/app/presentation/http
       ↓
backend/app/application  → backend/app/domain
       ↑ ports implemented by
backend/app/infrastructure/{pdf,ai,persistence}
       ↓
PostgreSQL / AI providers
```

Module mới nên đi theo luồng use case → port → adapter → route/UI. Hiện route và UI học vẫn khá tập trung trong một file; khi thêm tính năng lớn, tách theo feature thay vì tiếp tục nhồi vào đó. Xem [ARCHITECTURE.md](../ARCHITECTURE.md) cho sơ đồ thư mục.

## Ưu tiên tiếp theo

| Ưu tiên | Việc cần làm | Xong khi nào? |
| --- | --- | --- |
| P0 — an toàn dữ liệu | Session/token thực sự ở backend; phân quyền và sở hữu môn học/tài liệu theo user; cấu hình CORS/secret/DB credential cho môi trường triển khai | Không thể xem, tạo hoặc xoá dữ liệu của user khác bằng cách gọi API trực tiếp. |
| P1 — tính đúng | Kiểm tra source_pages và tính đúng với PDF, phát hiện câu trùng nghĩa, hiển thị summary | Nội dung sai/trùng ý bị từ chối có thông báo rõ; bộ học hiển thị đủ nội dung đã lưu. |
| P1 — vận hành | Migration DB (thay `create_all`), test API/UI, logging và xử lý lỗi provider | Có thể nâng schema và chạy test lặp lại mà không đụng dữ liệu thật. |
| P2 — PDF lớn | Chia chunk, tổng hợp kết quả, queue/background job, trạng thái tiến trình, retry có giới hạn | PDF dài không bị cắt thầm; người dùng biết job đang làm gì. |
| P2 — khả năng đọc | OCR cho PDF scan, lưu/trỏ về trang nguồn; cân nhắc object storage nếu cần tải lại PDF | Tài liệu scan dùng được và câu trả lời truy vết được nguồn. |
| P3 — học tập | Luyện hết bộ quiz, spaced repetition, tiến độ cá nhân, chia sẻ có quyền | Có dữ liệu tiến độ thật theo từng người học, không phải mock. |

## Ghi chú triển khai

- Giữ bí mật API key trong `backend/.env`; file mẫu chỉ khai báo tên biến. Không đưa key vào frontend.
- AI key/model và hạn mức có thể thay đổi theo nhà cung cấp; lỗi `429` không nên được “giải quyết” bằng retry vô hạn.
- Compose hiện dành cho local: PostgreSQL publish port `5432` và dùng credential phát triển. Trước khi public cần khoá lại mạng, thay secret và hoàn thành P0.
- File PDF upload hiện chỉ xử lý trong request; không có bản gốc để tải lại hoặc phục hồi sau khi xoá. Muốn có tính năng đó phải thiết kế storage và chính sách xoá riêng.

Hướng dẫn chạy chi tiết từ Windows/WSL: [README](../README.md).
