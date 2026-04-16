# Knowledge Graph API Bridge: Brainstorming Design

> Mật danh: **Phase 3 - Bơm linh hồn vào bản đồ**

Mục tiêu cốt lõi của bước này là giúp cái giao diện `KnowledgeGraphViewer` (React Flow) bên trái tự động hiển thị dữ liệu thật mỗi khi sinh viên học, đặc biệt là phải thấy được hiệu ứng "mọc nhánh phụ" khi thi rớt.

Dựa trên cấu trúc Agent-Native của DeepTutor, tôi đề xuất 2 Kiến trúc sau.

---

## Lựa chọn 1: Kiến trúc Real-time Streaming (Sử dụng WebSocket có sẵn) 🚀 ĐỀ XUẤT

DeepTutor vốn mạnh về giao tiếp Streaming nhờ file `deeptutor/core/stream_bus.py`. Chúng ta có thể tận dụng luôn nó!

1. **Backend (Khi nộp bài thi):**
   - Học sinh nộp bài -> Backend chấm điểm trong `grading.py`.
   - Nếu trúng điều kiện trượt -> Chạy hàm `handle_exam_failure` -> Sinh ra Node phụ.
   - Lưu vào SQLite qua `upsert_student_state`.
   - **Mấu chốt:** Gọi `await stream.event("graph_updated", state_data)` bắn qua WebSocket.

2. **Frontend (Sảnh đón):**
   - React Flow không xài biến hằng số `initialNodes` nữa.
   - Lắng nghe event `graph_updated` qua WebSocket hook.
   - Vừa có tín hiệu là `setNodes(newData)`. Đồ thị sẽ rung lên và mọc nhánh ảo diệu!

- **Ưu điểm:** Cảm giác xịn xò 100%. Không bị dính độ trễ API.
- **Nhược điểm:** Cần tìm đúng cái file WebSocket receiver trên Frontend để móc hook vào.

---

## Lựa chọn 2: Kiến trúc REST API truyền thống (Pull-based)

1. **Backend:** Tạo 1 Route API mới: `GET /api/v1/graph/sync?session_id=123`.
2. **Frontend:** 
   - Dùng SWR hoặc `useEffect` để fetch dữ liệu 1 lần lúc mới mở trang.
   - Khi chat bot báo "Thi trượt", frontend phải gửi một request API lần 2 để tải lại toàn bộ bản đồ.

- **Ưu điểm:** Cực kỳ dễ code, chuẩn chỉnh như sách giáo khoa.
- **Nhược điểm:** Mất cảm giác "Ảo thuật". Tốn thêm 1 request vô nghĩa.

---

## Cốt lõi cần làm (Nếu chọn WebSocket)

1. Cần sửa logic nộp bài Quiz (`deeptutor/services/exam/grading.py`). 
2. Cần thêm 1 hook nhỏ bắt tín hiệu socket trong `KnowledgeGraphViewer.tsx`.

Bạn có đồng ý chúng ta sẽ đi theo con đường **Lựa chọn 1 (WebSocket)** hay có bổ sung thêm các tính năng (Click vào Node trên bản đồ thì mở bài học) ở bước này không?
