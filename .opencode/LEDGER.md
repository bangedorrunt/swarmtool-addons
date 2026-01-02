# LEDGER

## Meta

---

---

### Learnings

#### Patterns ✅

- **Handoff Intent Alignment**: Đảm bảo metadata của tool (handoff intent) khớp với logic của plugin hook (`src/index.ts`) là cách tốt nhất để quản lý vòng đời sub-agent.
- **FQN Consistency**: Luôn phân giải agent name sang Fully Qualified Name trước khi gọi SDK giúp UI hiển thị đúng icon/thinking.
- **Single Source of Truth (Params)**: Ưu tiên một tham số định danh duy nhất (`agent`) thay vì nhiều alias giúp giảm thiểu lỗi logic khi phân giải.

#### Anti-Patterns ❌

- **Double Prompting**: Gọi `client.session.prompt` trong tool khi plugin hook cũng thực hiện gọi tương tự dẫn đến việc sub-agent bị kích hoạt hai lần.

---

## Archive

| Epic          | Title                                           | Outcome   | Date       |
| ------------- | ----------------------------------------------- | --------- | ---------- |
| hitl-test-001 | Test Human-in-Loop Communication & Coordination | SUCCEEDED | 2026-01-02 |

| Epic                          | Title                                                | Outcome   | Date       |
| ----------------------------- | ---------------------------------------------------- | --------- | ---------- |
| skill-agent-investigation-001 | Investigate skill_agent parameter mismatch           | SUCCEEDED | 2026-01-02 |
| deadlock-fix-001              | Refactor Waiting Mechanism to Event-Driven           | SUCCEEDED | 2026-01-01 |
| dps001                        | Durable Progress Streaming                           | SUCCEEDED | 2026-01-01 |
| orch006                       | Refactor Orchestrator for Markdown Workflow Patterns | PARTIAL   | 2026-01-01 |
| ama001                        | Interactive AMA Delegation Workflow                  | SUCCEEDED | 2025-12-31 |
