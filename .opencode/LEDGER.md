# LEDGER

## Meta

---

---

## Epic: skill-agent-investigation-001

**Title**: Investigate skill_agent parameter mismatch
**Status**: in_progress

| ID       | Title                                        | Agent          | Status | Outcome   |
| -------- | -------------------------------------------- | -------------- | ------ | --------- |
| inv001.1 | Consult Chief-of-Staff on skill_agent params | chief-of-staff | ✅     | SUCCEEDED |
| inv001.2 | Execute Investigation & Fix (A+C)            | executor       | ✅     | SUCCEEDED |

### Dependencies

- inv001.2 → depends on → inv001.1

### Governance

- **Decision**: Kết hợp phương án A và C. Đã refactor `skill_agent` và `agent_spawn` để sử dụng FQN đồng nhất và ưu tiên tham số `agent`.

### Learnings

#### Patterns ✅

- **Handoff Intent Alignment**: Đảm bảo metadata của tool (handoff intent) khớp với logic của plugin hook (`src/index.ts`) là cách tốt nhất để quản lý vòng đời sub-agent.
- **FQN Consistency**: Luôn phân giải agent name sang Fully Qualified Name trước khi gọi SDK giúp UI hiển thị đúng icon/thinking.
- **Single Source of Truth (Params)**: Ưu tiên một tham số định danh duy nhất (`agent`) thay vì nhiều alias giúp giảm thiểu lỗi logic khi phân giải.

#### Anti-Patterns ❌

- **Double Prompting**: Gọi `client.session.prompt` trong tool khi plugin hook cũng thực hiện gọi tương tự dẫn đến việc sub-agent bị kích hoạt hai lần.

---

## Learnings

### Patterns ✅

- Sử dụng `async: false` trong định nghĩa lệnh để biến sub-agent thành đơn vị thực thi tuần tự, giúp quản lý luồng HITL dễ dàng.
- Cơ chế trích xuất trạng thái đa tầng (multi-strategy extraction) giúp hệ thống ổn định ngay cả khi agent phản hồi bằng ngôn ngữ tự nhiên.
- Định nghĩa Workflow bằng Markdown giúp tách biệt logic khỏi code, tăng tính linh hoạt và dễ mở rộng.
- Sử dụng Durable Stream kết hợp với Heartbeat là mô hình chuẩn cho Long-running Agents.
- Event-Driven Architecture + History Check là giải pháp triệt để cho Deadlock thay vì Polling.

### Anti-Patterns ❌

- Thiếu tham số `session_id` trong `agent_dialogue` dẫn đến không đồng bộ hoàn toàn với `skill_agent`.

### Decisions

- Duy trì `session_id` xuyên suốt vòng lặp đối thoại để tránh mất ngữ cảnh.
- Sử dụng `skill_agent` với `async: false` cho các lệnh slash để đảm bảo tuần tự và dễ quản lý.
- Chọn `LEDGER.md` làm Source of Truth cho trạng thái Workflow HITL.
- Tự động Pause Epic khi Task Stale là cơ chế fail-safe quan trọng để bảo vệ state.
- Luôn kiểm tra Event History trước khi Subscribe để tránh Race Condition (Subagent xong trước khi Parent chờ).

### Preferences

_No preferences yet_

---

## Handoff

### What's Done

### What's Next

---

## Archive

| Epic             | Title                                                | Outcome   | Date       |
| ---------------- | ---------------------------------------------------- | --------- | ---------- |
| deadlock-fix-001 | Refactor Waiting Mechanism to Event-Driven           | SUCCEEDED | 2026-01-01 |
| dps001           | Durable Progress Streaming                           | SUCCEEDED | 2026-01-01 |
| orch006          | Refactor Orchestrator for Markdown Workflow Patterns | PARTIAL   | 2026-01-01 |
| ama001           | Interactive AMA Delegation Workflow                  | SUCCEEDED | 2025-12-31 |
