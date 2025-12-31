# SPEC: Refactor Orchestrator for Markdown Workflow Patterns

## Summary

Tái cấu trúc hệ thống orchestrator để tách biệt logic quy trình làm việc (workflow) ra khỏi code, sử dụng định dạng Markdown (.md) làm nguồn khai báo. Hệ thống mới sẽ hỗ trợ tải workflow động, quản lý trạng thái qua LEDGER.md và tích hợp Human-In-The-Loop (HITL) thông qua các điểm kiểm soát (checkpoints).

## Requirements

- **FR-001**: Tải và phân tích tệp workflow .md từ `src/orchestrator/workflow/`.
- **FR-002**: WorkflowProcessor thực thi các bước tuần tự, hỗ trợ chuyển tiếp giữa các agent.
- **FR-003**: Cập nhật LEDGER.md để lưu trữ `current_step`, `step_results`, `workflow_id`.
- **FR-004**: Hỗ trợ HITL checkpoint (tạm dừng chờ người dùng xác nhận).

## Technical Architecture

### Workflow Format (.md)

```markdown
---
name: sdd-workflow
trigger: ['refactor', 'implement', 'build']
entry_agent: chief-of-staff/interviewer
---

# Phases

## Phase 1: Context

- Agent: chief-of-staff/context-loader
- Prompt: "Gather context for {{task}}"

## Phase 2: Execution

- Agent: chief-of-staff/executor
- Wait: true
```

### Components

- **WorkflowLoader**: Quét thư mục, parse frontmatter bằng regex/yaml-front-matter.
- **WorkflowProcessor**: Class điều phối vòng lặp thực thi, quản lý context chuyển tiếp giữa các bước.

---

# PLAN: Implementation Roadmap

## Task orch006.1: Workflow Engine Implementation

- **File**: `src/orchestrator/workflow-engine.ts`
- **Logic**:
  1. Tạo interface `Workflow`, `Phase`, `Step`.
  2. Viết class `WorkflowLoader` sử dụng `Bun.file` để đọc và parse file.
  3. Viết class `WorkflowProcessor` với method `execute()` và `resume()`.
- **Verification**: Unit test với một mock workflow file.

## Task orch006.2: CoS Integration

- **File**: `src/orchestrator/tools.ts`, `src/orchestrator/chief-of-staff/index.ts`
- **Logic**:
  1. Đăng ký tool `execute_workflow`.
  2. Cập nhật prompt của CoS để gọi tool này khi nhận diện được intent phù hợp hoặc lệnh trực tiếp.
- **Verification**: Kiểm tra CoS có gọi đúng tool khi user nhập "refactor...".

## Task orch006.3: HITL & Persistence

- **File**: `src/orchestrator/ledger.ts`, `src/orchestrator/ledger-hooks.ts`
- **Logic**:
  1. Cập nhật `LedgerMeta` interface thêm `active_workflow` object.
  2. Trong `onSessionStart` hook, kiểm tra nếu có workflow đang `paused` thì gọi `WorkflowProcessor.resume()`.
- **Verification**: Giả lập tạm dừng workflow, restart session và kiểm tra việc resume.
