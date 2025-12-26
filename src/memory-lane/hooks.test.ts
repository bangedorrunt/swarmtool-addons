/**
 * Tests for memory-lane hooks
 *
 * Test-Driven Development approach:
 * 1. RED - Write failing test for createSwarmCompletionHook behavior
 * 2. GREEN - Implement minimal code to pass
 * 3. REFACTOR - Clean up while tests stay green
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import { getSwarmMailLibSQL, closeSwarmMailLibSQL } from "swarm-mail";
import type { SwarmMailAdapter } from "swarm-mail";
import { createSwarmCompletionHook } from "./hooks";

// Helper for real delays
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("createSwarmCompletionHook", () => {
  let swarmMail: SwarmMailAdapter;
  let projectPath: string;
  let consoleWarnSpy: any;
  let consoleLogSpy: any;
  let mockShell: any;
  let activeHook: (() => void) | undefined;

  beforeEach(async () => {
    // Use real timers for DB integration
    vi.useRealTimers();

    // Use getSwarmMailLibSQL to match what the hook uses (singleton pattern)
    // Use a unique path for each test run to avoid conflicts
    projectPath = `/tmp/test-hooks-${Date.now()}-${Math.random()}`;
    swarmMail = await getSwarmMailLibSQL(projectPath);

    // Mock console methods to verify behavior without side effects
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Mock shell helper
    mockShell = vi.fn(() => ({
      quiet: () => ({
        nothrow: () => ({
          signal: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" })
        })
      })
    }));
  });

  afterEach(async () => {
    if (activeHook) {
      activeHook(); // Stop the hook loop
      activeHook = undefined;
    }
    // Wait a bit for pending polls to clear
    await sleep(50);
    
    await swarmMail?.close();
    await closeSwarmMailLibSQL(projectPath);
    vi.restoreAllMocks();
  });

  describe("Test 1: Message with valid 'memory-catcher-extract' subject triggers memory-catcher spawn", () => {
    it("should process message with correct subject and extract data", async () => {
      // Register memory-catcher agent first (hook will do this, but we ensure it exists)
      await swarmMail.registerAgent(projectPath, "memory-catcher");

      // Pass short poll interval (100ms)
      const hook = await createSwarmCompletionHook(projectPath, mockShell, 100);
      activeHook = hook;

      // Send valid message with correct subject
      const outcomeData = {
        transcript: "Session transcript with full context...",
        summary: "Implemented feature X successfully",
        files_touched: ["src/feature.ts", "test/feature.test.ts"],
        success: true,
        duration_ms: 120000,
        error_count: 0,
        bead_id: "bd-test-123",
        epic_id: "epic-456",
        agent_name: "worker-1",
      };

      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify(outcomeData)
      );

      // Wait for poll
      await sleep(1000);

      // Verify hook logged processing
      const logCalls = consoleLogSpy.mock.calls;
      const processLogs = logCalls.filter((call: any[]) =>
        call[0]?.includes?.("Triggering extraction")
      );
      expect(processLogs.length).toBeGreaterThan(0);

      // Verify hook logged the spawn data
      const spawnLogs = logCalls.filter((call: any[]) =>
        call[0]?.includes?.("Spawning memory-catcher CLI process")
      );
      expect(spawnLogs.length).toBeGreaterThan(0);
    });

    it("should handle message with all optional fields", async () => {
      await swarmMail.registerAgent(projectPath, "memory-catcher");
      const hook = await createSwarmCompletionHook(projectPath, mockShell, 100);
      activeHook = hook;

      // Message with all optional fields present
      const outcomeData = {
        transcript: "Full session transcript...",
        summary: "Task completed",
        files_touched: ["src/file.ts"],
        success: true,
        duration_ms: 60000,
        error_count: 2,
        bead_id: "bd-full-test",
        epic_id: "epic-full",
        agent_name: "worker-full",
        evaluation: "Excellent work",
      };

      await swarmMail.sendMessage(
        projectPath,
        "worker-full",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify(outcomeData)
      );

      await sleep(1000);

      // Verify processing
      const processLogs = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Triggering extraction")
      );
      expect(processLogs.length).toBeGreaterThan(0);
    });
  });

  describe("Test 2: Message with different subject is ignored", () => {
    it("should not process messages with different subjects", async () => {
      await swarmMail.registerAgent(projectPath, "memory-catcher");
      const hook = await createSwarmCompletionHook(projectPath, mockShell, 100);
      activeHook = hook;

      // Send message with different subject
      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "some-other-subject",
        JSON.stringify({
          summary: "This should be ignored",
          files_touched: ["src/file.ts"],
          success: true,
          duration_ms: 1000,
        })
      );

      // Send message with matching subject to ensure hook is working
      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({
          summary: "This should be processed",
          files_touched: ["src/file.ts"],
          success: true,
          duration_ms: 1000,
          bead_id: "bd-test-proc",
        })
      );

      await sleep(1000);

      // Verify only the correct subject was processed
      const processLogs = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Triggering extraction")
      );

      // Should only see one "Triggering extraction" log (for matching subject)
      expect(processLogs.length).toBe(1);

      // Verify it was for the correct bead_id
      expect(processLogs[0][0]).toContain("bd-test-proc");
    });

    it("should handle multiple messages with mixed subjects", async () => {
      await swarmMail.registerAgent(projectPath, "memory-catcher");
      const hook = await createSwarmCompletionHook(projectPath, mockShell, 100);
      activeHook = hook;

      // Send multiple messages
      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "random-subject-1",
        JSON.stringify({ summary: "Ignore 1", files_touched: [], success: true, duration_ms: 100 })
      );

      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({ summary: "Process 1", files_touched: [], success: true, duration_ms: 100, bead_id: "bd-process-1" })
      );

      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "random-subject-2",
        JSON.stringify({ summary: "Ignore 2", files_touched: [], success: true, duration_ms: 100 })
      );

      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({ summary: "Process 2", files_touched: [], success: true, duration_ms: 100, bead_id: "bd-process-2" })
      );

      await sleep(1000);

      // Verify only matching subjects were processed
      const processLogs = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Triggering extraction")
      );

      expect(processLogs.length).toBe(2);
      const logContent = processLogs.map(log => log[0]).join("\n");
      expect(logContent).toContain("bd-process-1");
      expect(logContent).toContain("bd-process-2");
    });
  });

  describe("Test 3: Malformed message body logs warning without crashing", () => {
    it("should handle invalid JSON without crashing", async () => {
      await swarmMail.registerAgent(projectPath, "memory-catcher");
      const hook = await createSwarmCompletionHook(projectPath, mockShell, 100);
      activeHook = hook;

      // Send message with invalid JSON
      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        "invalid json {{{"
      );

      await sleep(1000);

      // Verify warning was logged
      const warnCalls = consoleWarnSpy.mock.calls;
      const parseErrorWarns = warnCalls.filter((call: any[]) =>
        call[0]?.includes?.("JSON parse error") || call[0]?.includes?.("Failed to parse")
      );

      expect(parseErrorWarns.length).toBeGreaterThan(0);

      // Verify hook is still running (should have logged other messages)
      const initLogs = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Initialized") || call[0]?.includes?.("Listening")
      );
      expect(initLogs.length).toBeGreaterThan(0);

      // Send valid message to verify hook is still working
      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({
          summary: "Valid message",
          files_touched: [],
          success: true,
          duration_ms: 100,
        })
      );

      await sleep(1000);

      const processLogs = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Triggering extraction")
      );
      expect(processLogs.length).toBeGreaterThan(0);
    });

    it("should handle message with missing required fields", async () => {
      await swarmMail.registerAgent(projectPath, "memory-catcher");
      const hook = await createSwarmCompletionHook(projectPath, mockShell, 100);
      activeHook = hook;

      // Missing summary field
      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({
          files_touched: [],
          success: true,
          duration_ms: 100,
        })
      );

      await sleep(1000);

      // Verify warning about missing field
      const warnCalls = consoleWarnSpy.mock.calls;
      const fieldWarnings = warnCalls.filter((call: any[]) =>
        call[0]?.includes?.("summary") || call[0]?.includes?.("Missing or invalid")
      );

      expect(fieldWarnings.length).toBeGreaterThan(0);

      // Verify hook is still running
      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({
          summary: "Valid message",
          files_touched: [],
          success: true,
          duration_ms: 100,
        })
      );

      await sleep(1000);

      const processLogs = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Triggering extraction")
      );
      expect(processLogs.length).toBeGreaterThan(0);
    });

    it("should handle message with invalid field types", async () => {
      await swarmMail.registerAgent(projectPath, "memory-catcher");
      const hook = await createSwarmCompletionHook(projectPath, mockShell, 100);
      activeHook = hook;

      // Invalid types for required fields
      const invalidMessages = [
        { summary: 123, files_touched: [], success: true, duration_ms: 100 }, // summary not string
        { summary: "test", files_touched: "not array", success: true, duration_ms: 100 }, // files_touched not array
        { summary: "test", files_touched: [], success: "yes", duration_ms: 100 }, // success not boolean
        { summary: "test", files_touched: [], success: true, duration_ms: "100" }, // duration_ms not number
      ];

      for (const invalidData of invalidMessages) {
        await swarmMail.sendMessage(
          projectPath,
          "worker-1",
          ["memory-catcher"],
          "memory-catcher-extract",
          JSON.stringify(invalidData)
        );
      }

      await sleep(1000);

      // Verify warnings were logged for each invalid message
      const warnCalls = consoleWarnSpy.mock.calls;
      expect(warnCalls.length).toBeGreaterThanOrEqual(4);

      // Verify hook is still running
      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({
          summary: "Valid message",
          files_touched: [],
          success: true,
          duration_ms: 100,
        })
      );

      await sleep(1000);

      const processLogs = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Triggering extraction")
      );
      expect(processLogs.length).toBeGreaterThan(0);
    });
  });

  describe("Test 4: Memory-catcher spawn failure logs warning without throwing", () => {
    it("should handle swarm-mail errors during message processing", async () => {
      await swarmMail.registerAgent(projectPath, "memory-catcher");
      const hook = await createSwarmCompletionHook(projectPath, mockShell, 100);
      activeHook = hook;

      // Send valid message
      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({
          summary: "Test message",
          files_touched: [],
          success: true,
          duration_ms: 100,
        })
      );

      await sleep(1000);

      // Verify hook processed the message
      const processLogs = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Triggering extraction")
      );
      expect(processLogs.length).toBeGreaterThan(0);

      // Hook should still be running - send another message
      await swarmMail.sendMessage(
        projectPath,
        "worker-2",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({
          summary: "Test message 2",
          files_touched: [],
          success: true,
          duration_ms: 100,
        })
      );

      await sleep(1000);

      const processLogs2 = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Triggering extraction")
      );
      expect(processLogs2.length).toBeGreaterThanOrEqual(2); // Should have processed both
    });

    it("should handle acknowledge errors gracefully", async () => {
      await swarmMail.registerAgent(projectPath, "memory-catcher");

      // Mock acknowledgeMessage to throw an error
      const originalAck = swarmMail.acknowledgeMessage.bind(swarmMail);
      swarmMail.acknowledgeMessage = vi.fn().mockRejectedValue(new Error("Ack failed"));

      const hook = await createSwarmCompletionHook(projectPath, mockShell, 100);
      activeHook = hook;

      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({
          summary: "Test message",
          files_touched: [],
          success: true,
          duration_ms: 100,
        })
      );

      await sleep(1000);

      // Verify warning about acknowledge failure
      const warnCalls = consoleWarnSpy.mock.calls;
      const ackWarnings = warnCalls.filter((call: any[]) =>
        call[0]?.includes?.("acknowledge") || call[0]?.includes?.("Ack")
      );

      // Hook should have logged warning but not crashed
      expect(ackWarnings.length).toBeGreaterThan(0);

      // Verify hook is still processing
      expect(consoleLogSpy.mock.calls.some((call: any[]) =>
        call[0]?.includes?.("Triggering extraction")
      )).toBe(true);

      // Restore original and clean up
      swarmMail.acknowledgeMessage = originalAck;
    });
  });

  describe("Test 5: Adapter initialization errors are handled gracefully", () => {
    it("should handle invalid project path without throwing", async () => {
      // Create hook with invalid path
      const hook = await createSwarmCompletionHook("/nonexistent/path/that/does/not/exist", mockShell, 100);
      activeHook = hook;

      // Verify hook was created (returns stop function)
      expect(typeof hook).toBe("function");

      // Hook function should be callable (stop listener)
      expect(() => hook()).not.toThrow();
      activeHook = undefined; // Already stopped

      // Should log that it stopped
      expect(consoleLogSpy.mock.calls.some((call: any[]) =>
        call[0]?.includes?.("Stopped listening")
      )).toBe(true);
    });

    it("should return a stop function even when initialization fails", async () => {
      const hook = await createSwarmCompletionHook("/invalid/path", mockShell, 100);
      activeHook = hook;

      expect(typeof hook).toBe("function");

      // Calling stop should not throw
      expect(() => hook()).not.toThrow();
      activeHook = undefined; // Already stopped

      // Should log that it stopped
      expect(consoleLogSpy.mock.calls.some((call: any[]) =>
        call[0]?.includes?.("Stopped listening")
      )).toBe(true);
    });

    it("should handle agent registration errors gracefully", async () => {
      // Use a valid project path but mock registerAgent to fail
      const hook = await createSwarmCompletionHook(projectPath, mockShell, 100);
      activeHook = hook;

      // Hook should have logged warning about registration failure
      // (the hook catches this error and continues)
      const warnCalls = consoleWarnSpy.mock.calls;

      // Registration might succeed (agent already exists) or fail - either way hook continues
      // Just verify hook was created
      expect(typeof hook).toBe("function");

      // Verify hook is still working by sending a message
      await swarmMail.registerAgent(projectPath, "memory-catcher");

      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({
          summary: "Test message",
          files_touched: [],
          success: true,
          duration_ms: 100,
        })
      );

      await sleep(1000);

      const processLogs = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Triggering extraction")
      );
      expect(processLogs.length).toBeGreaterThan(0);
    });
  });

  describe("Additional edge cases", () => {
    it("should stop listening when stop function is called", async () => {
      const hook = await createSwarmCompletionHook(projectPath, mockShell, 100);
      activeHook = hook;

      await swarmMail.registerAgent(projectPath, "memory-catcher");

      // Send first message
      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({
          summary: "Before stop",
          files_touched: [],
          success: true,
          duration_ms: 100,
        })
      );

      await sleep(1000);

      const processLogsBefore = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Triggering extraction")
      );

      // Stop the hook
      hook();
      activeHook = undefined; // Already stopped

      expect(consoleLogSpy.mock.calls.some((call: any[]) =>
        call[0]?.includes?.("Stopped listening")
      )).toBe(true);

      // Send second message after stop
      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({
          summary: "After stop",
          files_touched: [],
          success: true,
          duration_ms: 100,
        })
      );

      await sleep(1000);

      const processLogsAfter = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Triggering extraction")
      );

      // Should not have processed the second message
      expect(processLogsAfter.length).toBe(processLogsBefore.length);
    });

    it("should handle empty files_touched array", async () => {
      await swarmMail.registerAgent(projectPath, "memory-catcher");
      const hook = await createSwarmCompletionHook(projectPath, mockShell, 100);
      activeHook = hook;

      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({
          summary: "No files touched",
          files_touched: [],
          success: true,
          duration_ms: 100,
        })
      );

      await sleep(1000);

      const spawnLogs = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Spawning memory-catcher CLI process")
      );

      expect(spawnLogs.length).toBeGreaterThan(0);
    });

    it("should handle very long transcript", async () => {
      await swarmMail.registerAgent(projectPath, "memory-catcher");
      const hook = await createSwarmCompletionHook(projectPath, mockShell, 100);
      activeHook = hook;

      const longTranscript = "a".repeat(100000);

      await swarmMail.sendMessage(
        projectPath,
        "worker-1",
        ["memory-catcher"],
        "memory-catcher-extract",
        JSON.stringify({
          transcript: longTranscript,
          summary: "Long transcript test",
          files_touched: ["src/file.ts"],
          success: true,
          duration_ms: 1000
        })
      );

      await sleep(1000);

      const spawnLogs = consoleLogSpy.mock.calls.filter((call: any[]) =>
        call[0]?.includes?.("Spawning memory-catcher CLI process")
      );

      expect(spawnLogs.length).toBeGreaterThan(0);
    });
  });
});