# MayStudy

MayStudy biến PDF môn học thành flashcard và câu hỏi ôn tập. Đây là bản local MVP: làm được việc, chưa phải “AI học hộ bạn”. Đọc tài liệu vẫn là kèo của mình; MayStudy lo phần bớt ngợp.

Hiện tại bạn có thể đăng nhập, tạo/đổi tên/xoá môn học, thêm/xoá PDF, học flashcard, làm câu hỏi trắc nghiệm và trò chuyện với May qua nút chat góc phải. May hiện trạng thái đang gõ rồi hiển thị câu trả lời dần theo luồng từ LLM. Khi đang mở một môn học, May dùng phần tài liệu đã lưu của môn đó để hỗ trợ trả lời; ở trang tổng quan, May là trợ lý học tập chung. Hội thoại hiện chỉ giữ trong phiên trang, chưa lưu vào PostgreSQL. Dữ liệu môn học và nội dung AI sinh ra được lưu trong PostgreSQL. Giao diện có EN/VI và sáng/tối.

## Chạy từ đầu trên Windows — không cần Docker Desktop

Hướng dẫn này dành cho **Windows 10 (build 19041+) hoặc Windows 11 + WSL 2 + Ubuntu 24.04**. Docker Engine (`docker.io`) và PostgreSQL chạy trong WSL; frontend là web tĩnh chạy bằng Python. Không cần cài Node.js, npm hay Python package trên Windows.

> Đã có WSL và Docker chạy tốt rồi? Đi thẳng tới bước 3 bên dưới. Đừng cài lại chỉ để cho đúng nghi thức.

### 1. Cài WSL 2 và Ubuntu

Mở **PowerShell bằng quyền Administrator** trên Windows:

```powershell
wsl --install -d Ubuntu-24.04
```

Khởi động lại Windows nếu được yêu cầu. Lần đầu mở Ubuntu, tạo **Linux username/password** riêng; lúc gõ password terminal sẽ không hiện ký tự — bình thường.

Nếu WSL đã có sẵn, kiểm tra và cập nhật từ PowerShell:

```powershell
wsl --update
wsl --list --verbose
wsl -d Ubuntu-24.04
```

Dòng Ubuntu phải có `VERSION 2`. Nếu đang là `1`, chạy `wsl --set-version Ubuntu-24.04 2` trong PowerShell. Tên distro phải đúng như kết quả `wsl --list --verbose` (máy đã cài trước có thể chỉ tên `Ubuntu`); thay `Ubuntu-24.04` trong các lệnh trên bằng tên đó. Từ đây trở đi, các lệnh `bash` chạy **trong terminal Ubuntu/WSL**, không phải PowerShell.

Nếu lần mở đầu rơi vào dấu nhắc `#`/user `root` dù bạn vừa tạo user, chạy `whoami` để kiểm tra. Quay lại PowerShell và mở đúng user bằng `wsl -d Ubuntu-24.04 -u <linux_username>`; thay `Ubuntu-24.04` bằng tên distro thực tế. Muốn đặt user đó làm mặc định, thêm vào `/etc/wsl.conf` (giữ nguyên các mục có sẵn):

```ini
[user]
default=<linux_username>
```

Sau đó chạy `wsl --shutdown` trong PowerShell và mở Ubuntu lại. Lệnh này tắt **mọi** distro WSL đang chạy, nên nhớ lưu việc trước.

### 2. Cài Docker Engine và Compose trong Ubuntu

Ubuntu 24.04 có gói `docker.io` và `docker-compose-v2`; không cần Docker Desktop. Trong terminal Ubuntu:

```bash
sudo apt update
sudo apt install -y software-properties-common python3 curl nano
sudo add-apt-repository -y universe
sudo apt update
sudo apt install -y docker.io docker-compose-v2
```

Kiểm tra `systemd`:

```bash
ps -p 1 -o comm=
```

Nếu kết quả là `systemd`, chạy tiếp:

```bash
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

Nếu kết quả **không** phải `systemd`, mở `sudo nano /etc/wsl.conf`, thêm mục sau (đừng xoá `[user]` hay cấu hình cũ):

```ini
[boot]
systemd=true
```

Lưu file, quay lại PowerShell chạy `wsl --shutdown`, mở Ubuntu lại rồi chạy ba lệnh `systemctl`/`docker` ở trên. README dùng `sudo docker` xuyên suốt để khỏi phải thêm user vào nhóm `docker`; nhóm đó có quyền tương đương root, không phải món quà miễn phí.

### 3. Chuẩn bị project và `.env`

Trong Ubuntu, đi tới đúng thư mục source hiện tại:

```bash
cd /mnt/c/Users/Administrator/Downloads/Vk_iu_Project
pwd
```

Nếu đã chuyển/clone project sang thư mục khác, thay đường dẫn tương ứng. Với WSL, để source trong Linux filesystem (`/home/...`) sẽ nhanh hơn `/mnt/c/...` khi build nhiều; đường dẫn trên ưu tiên khớp chính xác máy hiện tại.

Tạo file cấu hình **chỉ khi chưa có**; lệnh này không ghi đè key bạn đã nhập:

```bash
if [ ! -f backend/.env ]; then cp backend/.env.example backend/.env; fi
nano backend/.env
```

Trong `backend/.env`, cần đặt:

- `ADMIN_PASSWORD`: mật khẩu đăng nhập admin của **máy bạn**; đừng để trống và đừng commit `.env`.
- Ít nhất **một** trong `MISTRAL_API_KEY`, `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` để tạo bộ học. Một key là chạy được; nhiều key giúp thử provider tiếp theo khi gặp 429.
- `DATABASE_URL` giữ giá trị mẫu khi chạy bằng Compose, vì hostname `postgres` là tên service trong Docker network.
- `MISTRAL_MODEL`/`GEMINI_MODEL` phải là model mà key của bạn hiện được phép dùng. Tên trong file mẫu không bảo đảm nhà cung cấp sẽ hỗ trợ mãi.

`ADMIN_USERNAME=admin` là mặc định. API chỉ tạo tài khoản admin **nếu chưa tồn tại** khi khởi động; đổi `ADMIN_PASSWORD` trong `.env` về sau không tự đổi mật khẩu của tài khoản đã có trong DB.

### 4. Chạy PostgreSQL + backend

Vẫn ở thư mục gốc của project trong Ubuntu:

```bash
sudo systemctl start docker
sudo docker compose -f infra/docker-compose.yml up -d --build
sudo docker compose -f infra/docker-compose.yml ps
curl http://localhost:8000/health
```

Nếu ổn, lệnh `curl` trả `{"status":"ok"}`. Lần đầu build/pull image có thể mất vài phút. Xem log backend khi cần:

```bash
sudo docker compose -f infra/docker-compose.yml logs -f api
```

Nhấn `Ctrl+C` chỉ thoát màn hình log, **không** tắt container.

### 5. Chạy frontend ở terminal Ubuntu thứ hai

Mở **terminal Ubuntu/WSL mới**, rồi:

```bash
cd /mnt/c/Users/Administrator/Downloads/Vk_iu_Project
python3 -m http.server 5173 --bind 0.0.0.0 --directory frontend
```

Mở trình duyệt Windows tại **http://localhost:5173**. API ở **http://localhost:8000**, tài liệu API ở **http://localhost:8000/docs**. Bạn có thể chọn **Tạo tài khoản**, nhập tên đăng nhập và mật khẩu (tối thiểu 8 ký tự), rồi đăng nhập bằng tài khoản vừa tạo; hoặc đăng nhập admin bằng `ADMIN_USERNAME` và `ADMIN_PASSWORD` đã đặt. Tài khoản và mật khẩu băm được lưu trong PostgreSQL. Frontend là file tĩnh, **không chạy từ `file://`** và không cần `npm install`/`npm run dev`.

Luồng thử nhanh: đăng nhập → tạo môn học → vào môn học → thêm PDF có text (tối đa 15 MB) → đợi AI xử lý → học 10 flashcard và 20 câu quiz. Trong màn hình học, dùng mũi tên để chuyển câu; nút tròn **↻** gọi API tạo bộ 20 câu + 10 flashcard mới từ cùng tài liệu. Trên thẻ môn học hoặc trang chi tiết có nút **Đổi tên** và **Xoá môn học**. Xoá môn học sẽ xoá vĩnh viễn mọi tài liệu, flashcard và quiz trong môn đó; giao diện yêu cầu xác nhận trước khi gọi API.

### Những lần chạy sau và cách dừng

Mỗi lần mở máy, vào Ubuntu, `cd` tới project và chạy:

```bash
sudo systemctl start docker
sudo docker compose -f infra/docker-compose.yml up -d
```

Ở terminal Ubuntu thứ hai, chạy lại lệnh `python3 -m http.server ...` ở bước 5. Nếu sửa dependencies/Dockerfile, dùng `up -d --build` thay cho `up -d`.

Để dừng: `Ctrl+C` ở terminal frontend, rồi trong terminal backend:

```bash
sudo docker compose -f infra/docker-compose.yml down
```

`down` giữ dữ liệu trong named volume của PostgreSQL. **Đừng thêm `-v`** nếu không chủ ý xoá database — cái đó không có nút undo.

## Nếu không chạy, check mấy chỗ này trước

| Dấu hiệu | Kiểm tra |
| --- | --- |
| `Cannot connect to the Docker daemon` | Trong Ubuntu chạy `sudo systemctl start docker`; nếu `systemctl` lỗi, kiểm tra bước bật `systemd`. |
| `docker compose` không tồn tại | Kiểm tra `sudo docker compose version`; cài `docker-compose-v2` ở bước 2. |
| FE mở được nhưng không tải dữ liệu | Kiểm tra `curl http://localhost:8000/health`, `sudo docker compose -f infra/docker-compose.yml ps` và `logs -f api`. |
| Port `8000`, `5173` hoặc `5432` đã được dùng | Dừng service đang chiếm port hoặc đổi mapping/URL tương ứng; FE mặc định gọi `http://localhost:8000/v1`. |
| PDF không tạo được bộ học | PDF scan/ảnh chưa có OCR. Đảm bảo có text, dưới 15 MB và ít nhất một AI key hợp lệ. |
| AI trả `429` hoặc model `404` | Kiểm tra hạn mức key và `MISTRAL_MODEL`/`GEMINI_MODEL`; fallback chỉ áp dụng khi provider báo rate limit. |
| Không đăng nhập được sau khi đổi `.env` | Admin đã tồn tại sẽ không tự cập nhật mật khẩu; kiểm tra đúng thông tin đã dùng lúc tạo DB. |

## Source nằm ở đâu?

```text
backend/app/domain/          # dữ liệu nghiệp vụ
backend/app/application/     # use case và interface
backend/app/infrastructure/  # PyMuPDF, AI, PostgreSQL
backend/app/presentation/    # FastAPI routes
frontend/src/core/           # cấu hình/chức năng dùng chung
frontend/src/features/       # auth UI, learning UI và chat widget
infra/docker-compose.yml     # postgres + api
docs/IMPLEMENTATION_PLAN.md  # trạng thái thật và việc tiếp theo
```

Xem thêm [kiến trúc](ARCHITECTURE.md) và [kế hoạch triển khai](docs/IMPLEMENTATION_PLAN.md).

## Giới hạn hiện tại

Đây là môi trường phát triển local, **chưa nên public nguyên trạng**. API môn học/tài liệu/chat hiện yêu cầu Bearer session lưu trong PostgreSQL; dữ liệu môn học được tách theo tài khoản. Session tồn tại 30 ngày, được kiểm tra lại khi tải trang và bị thu hồi khi đăng xuất. Token vẫn nằm trong `localStorage` của trình duyệt; bản local chưa có chống brute-force/rate limit cho đăng nhập và PostgreSQL trong Compose còn mở port `5432` với credential mẫu. **Đừng mở API qua Dev Tunnel/public Internet cho người lạ** khi chưa harden thêm. Môn học cũ trước tính năng tài khoản được gán cho admin khi backend khởi động nếu có admin trong DB. PDF gốc không được lưu; tài liệu upload từ phiên bản này lưu text theo trang để tạo lại bộ học. Tài liệu cũ chưa có text nguồn phải upload lại để dùng ↻. Backend loại câu trùng/sát chữ với lịch sử trước khi lưu, nhưng chưa thể bảo đảm phát hiện mọi câu diễn đạt khác mà hỏi cùng một ý; nếu AI không sinh đủ bộ mới sau ba lượt, API báo lỗi và giữ nguyên bộ cũ. PDF scan chưa có OCR. Chi tiết ưu tiên sửa nằm trong [implementation plan](docs/IMPLEMENTATION_PLAN.md).

Tài liệu cài đặt tham khảo: [Microsoft WSL](https://learn.microsoft.com/en-us/windows/wsl/install), [Ubuntu 24.04 trên WSL](https://ubuntu.com/wsl/docs/stable/tutorials/develop-with-ubuntu-wsl/), [WSL systemd](https://learn.microsoft.com/en-us/windows/wsl/systemd/), [lưu source giữa Windows/WSL](https://learn.microsoft.com/en-us/windows/wsl/filesystems), [Ubuntu `docker-compose-v2`](https://packages.ubuntu.com/noble/docker-compose-v2), [Docker về quyền của nhóm `docker`](https://docs.docker.com/engine/install/linux-postinstall/).
