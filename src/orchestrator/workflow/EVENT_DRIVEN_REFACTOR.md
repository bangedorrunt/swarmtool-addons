# Status: COMPLETED

# EVENT-DRIVEN WAITING MECHANISM REFACTOR

## GOAL

Loại bỏ deadlock do cơ chế polling gây ra trong `agent-spawn.ts` và `session-coordination.ts` bằng cách chuyển sang kiến trúc hướng sự kiện (Event-Driven).

## ARCHITECTURE CHANGE

TRƯỚC (Polling):
• Sử dụng vòng lặp `while` với `setTimeout`.
• Liên tục gọi `client.session.status()`.
• Nguy cơ: Gây nghẽn event loop, race condition, và tốn tài nguyên.

SAU (Event-Driven):
• Sử dụng `DurableStreamOrchestrator.subscribe()`.
• Lắng nghe các sự kiện `agent.completed` hoặc `agent.failed`.
• Sử dụng `Promise` wrapper với timeout fallback.

## IMPLEMENTATION STEPS

1. REFACTOR `AGENT-SPAWN.TS`
   • Vị trí: `agent_spawn` tool (khi `isAsync = false`).
   • Thay thế polling loop bằng `Promise`.
   • Lắng nghe sự kiện từ `getDurableStreamOrchestrator()`.
   • Filter sự kiện theo `sessionId` của sync session.

2. REFACTOR `SESSION-COORDINATION.TS`
   • Vị trí: Hàm `waitForSessionCompletion`.
   • Triển khai cơ chế `subscribe` tương tự.
   • Sử dụng `Promise.race` để kết hợp Event listener và Timeout.

3. SAFETY & FALLBACK
   • Luôn kiểm tra trạng thái session 1 lần cuối (One-shot poll) trước khi bắt đầu lắng nghe hoặc khi timeout để tránh miss event do race condition.

## VERIFICATION

• Chạy unit test cho `agent-spawn` và `session-coordination`.
• Mock `DurableStreamOrchestrator` để phát các sự kiện hoàn thành/thất bại.
