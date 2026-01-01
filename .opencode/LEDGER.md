# LEDGER

## Meta

session_id: sess_dps_001
status: active
phase: PLANNING
last_updated: 2026-01-01T00:00:00.000Z
tasks_completed: 2/2
current_task: -

---

## Epic: orch-sdk-v2

**Title**: Refactor Orchestrator to Native Event-Driven SDK V2
**Status**: in_progress

| ID     | Title                                       | Agent              | Status | Outcome   |
| ------ | ------------------------------------------- | ------------------ | ------ | --------- |
| orch.1 | Update ActorState & Trace Propagation       | workflow-architect | ✅     | SUCCEEDED |
| orch.2 | Implement Async Spawn & Resume Logic        | executor           | ✅     | SUCCEEDED |
| orch.3 | Add Cascading Cancellation & Loop Detection | executor           | ✅     | SUCCEEDED |

### Dependencies

- orch.2 -> depends on -> orch.1
- orch.3 -> depends on -> orch.2

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
- **Ưu tiên Epic dps001**: Lưu trữ orch006 vào Archive để tập trung vào hệ thống streaming mới.
- Tự động Pause Epic khi Task Stale là cơ chế fail-safe quan trọng để bảo vệ state.
- Luôn kiểm tra Event History trước khi Subscribe để tránh Race Condition (Subagent xong trước khi Parent chờ).

---

## Handoff

**Context**: Đã chuyển đổi hoàn toàn cơ chế chờ sang Event-Driven, loại bỏ deadlock khi chạy song song.

**Next Steps**: Hệ thống sẵn sàng cho các tác vụ phức tạp hoặc high-concurrency.

---

## Archive

| Epic             | Title                                                | Outcome   | Date       |
| ---------------- | ---------------------------------------------------- | --------- | ---------- |
| deadlock-fix-001 | Refactor Waiting Mechanism to Event-Driven           | SUCCEEDED | 2026-01-01 |
| dps001           | Durable Progress Streaming                           | SUCCEEDED | 2026-01-01 |
| orch006          | Refactor Orchestrator for Markdown Workflow Patterns | PARTIAL   | 2026-01-01 |
| ama001           | Interactive AMA Delegation Workflow                  | SUCCEEDED | 2025-12-31 |
