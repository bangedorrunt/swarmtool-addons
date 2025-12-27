# Hooks Comparison: oh-my-opencode (OMO) vs Native OpenCode (NOC)

## Overview

This report provides a technical comparison between two hook systems for extending OpenCode:

- **oh-my-opencode (OMO)**: A user-friendly hook system that runs external subprocesses configured via JSON matching rules
- **Native OpenCode (NOC)**: The core OpenCode hook system built on stateful TypeScript closures with direct SDKClient access

Both systems enable event-driven extensions but follow fundamentally different architectural approaches, trade-offs, and target use cases.

---

## Technical Comparison Table

| Aspect               | oh-my-opencode (OMO)           | Native OpenCode (NOC)             |
| -------------------- | ------------------------------ | --------------------------------- |
| **Execution Model**  | Stateless subprocesses         | Stateful in-process closures      |
| **Language**         | Any (via CLI/subprocess)       | TypeScript                        |
| **Hook Events**      | 5 events                       | 25+ events                        |
| **Configuration**    | JSON matching rules            | TypeScript code                   |
| **Runtime Access**   | Environment variables only     | Full SDKClient + closures         |
| **Return Values**    | None (env var injection only)  | Composable return objects         |
| **Build Step**       | Not required                   | Required (TypeScript compilation) |
| **Performance**      | 10-100x slower (process spawn) | Fast (in-process)                 |
| **State Management** | Stateless                      | Stateful (closures)               |
| **Integration**      | Async (subprocess boundaries)  | Direct method calls               |
| **Ecosystem**        | CLI tools, scripts             | npm packages, TypeScript          |

---

## Detailed Pros & Cons

### Architecture

#### oh-my-opencode (OMO)

**Pros:**

- **Language-agnostic**: Can trigger any executable (Python, Bash, Rust, Go, etc.)
- **Simple mental model**: Configure once, run forever via JSON rules
- **Isolation**: Subprocess boundaries prevent plugin crashes from affecting OpenCode
- **No build pipeline**: Deploy configuration files directly
- **Lower entry barrier**: Suitable for users without TypeScript experience

**Cons:**

- **Stateless**: Cannot maintain state between hook executions
- **Limited communication**: Only environment variable injection available
- **No direct SDK access**: Must parse CLI output or use secondary mechanisms
- **Process spawn overhead**: Each hook execution creates a new subprocess
- **Debugging challenges**: Subprocess stderr must be manually captured and parsed

#### Native OpenCode (NOC)

**Pros:**

- **Stateful closures**: Maintain state across hook invocations
- **Direct SDKClient access**: Full OpenCode API at your fingertips
- **Composable return objects**: Can modify tool behavior, inject context, or block execution
- **Type safety**: TypeScript provides compile-time guarantees
- **Fine-grained control**: Access to 25+ lifecycle events for precise orchestration

**Cons:**

- **Language locked**: Requires TypeScript/JavaScript knowledge
- **Build step required**: Must compile before deployment
- **Higher complexity**: Requires understanding of closures, async patterns, and OpenCode internals
- **Shared memory**: Plugin bugs can crash or degrade OpenCode performance
- **Learning curve**: Steeper for users unfamiliar with OpenCode SDK

---

### Performance

#### oh-my-opencode (OMO)

**Pros:**

- **Transparent resource usage**: Subprocess isolation makes resource limits clear
- **Parallelizable**: Multiple subprocesses can run concurrently
- **No memory leaks**: Process termination ensures cleanup

**Cons:**

- **10-100x slower**: Process spawn overhead is significant for frequent hooks
- **Serialization cost**: Data must be serialized/deserialized across process boundaries
- **Startup latency**: Cold start for each subprocess (interpreters, runtime loading)
- **Limited to async**: Cannot participate in synchronous tool execution

#### Native OpenCode (NOC)

**Pros:**

- **10-100x faster**: In-process execution eliminates spawn overhead
- **Direct memory access**: Pass complex objects by reference
- **Synchronous hooks**: Can intercept and modify tool calls synchronously
- **Hot reload friendly**: Code changes can be reflected without process restart

**Cons:**

- **Memory footprint**: Loaded plugins increase OpenCode's resident memory
- **Blocking risk**: Poorly written hooks can block the main thread
- **Harder to isolate**: Malicious or buggy plugins can impact OpenCode stability
- **Resource contention**: Multiple plugins compete for same process resources

---

### Developer Experience

#### oh-my-opencode (OMO)

**Pros:**

- **Zero TypeScript**: No build tools, no compilation step
- **Git-friendly**: JSON configuration is easy to review and diff
- **Low friction**: Add a hook by editing a config file, not writing code
- **Testable with any tool**: Use your preferred language's testing framework
- **Portable**: Configuration works across machines without dependencies

**Cons:**

- **Limited tooling**: No TypeScript IDE features, type hints, or refactoring support
- **JSON maintenance**: Large rule files become difficult to manage
- **Error messages**: Subprocess errors are less informative than stack traces
- **Documentation fragmentation**: Must consult both OpenCode docs and external CLI docs
- **Version drift**: External scripts can evolve independently of hook definitions

#### Native OpenCode (NOC)

**Pros:**

- **Full TypeScript ecosystem**: IDE support, autocomplete, refactoring
- **npm integration**: Leverage existing packages via package.json
- **Testing**: Native test frameworks (vitest, jest) with OpenCode mocking
- **Source maps**: Debuggable stack traces with source-level breakpoints
- **Type safety**: Compile-time catching of API misuse

**Cons:**

- **Build toolchain**: Requires package.json, tsconfig, and build scripts
- **Dependency management**: npm dependencies can introduce conflicts
- **Versioning complexity**: Must align plugin versions with OpenCode SDK
- **Onboarding time**: New developers must learn TypeScript and OpenCode internals
- **Release overhead**: Must publish to npm or distribute compiled artifacts

---

## Use Case Recommendations

### Choose oh-my-opencode (OMO) when:

1. **You need language flexibility**
   - You have existing scripts in Python, Bash, or other languages
   - You want to trigger external CLI tools (linters, formatters, build systems)
   - Your team lacks TypeScript expertise

2. **Simple, fire-and-forget hooks**
   - Logging and audit trail collection
   - Notifying external services (webhooks, Slack, email)
   - Triggering background jobs (deployments, backups)

3. **Low maintenance overhead**
   - Small teams with limited DevOps resources
   - Occasional hooks that don't require state
   - Configuration-driven workflows

4. **Isolation is critical**
   - Running untrusted third-party code
   - Enforcing strict resource limits
   - Preventing plugin crashes from affecting OpenCode

### Choose Native OpenCode (NOC) when:

1. **Performance is critical**
   - High-frequency hooks (every tool call, every file read)
   - Latency-sensitive operations
   - Real-time tool modification or blocking

2. **Stateful behavior required**
   - Maintaining caches or in-memory state
   - Multi-step workflows with shared context
   - Complex business logic that depends on prior hook executions

3. **Deep integration needed**
   - Modifying tool arguments or return values
   - Injecting dynamic context based on agent state
   - Implementing custom coordination patterns

4. **You're building a plugin package**
   - Distributing reusable functionality via npm
   - Providing a polished developer experience
   - Leveraging the TypeScript ecosystem

5. **Advanced use cases**
   - Implementing custom tool behaviors
   - Building orchestration layers (swarm coordination, multi-agent systems)
   - Creating composable middleware chains

---

## Decision Matrix

| Criterion                   | Weight | OMO Score | NOC Score | Weighted OMO | Weighted NOC |
| --------------------------- | ------ | --------- | --------- | ------------ | ------------ |
| Performance (1-10)          | 3      | 3         | 9         | 9            | 27           |
| Ease of Setup (1-10)        | 2      | 9         | 4         | 18           | 8            |
| Maintainability (1-10)      | 2      | 6         | 8         | 12           | 16           |
| Extensibility (1-10)        | 3      | 4         | 9         | 12           | 27           |
| Language Flexibility (1-10) | 2      | 9         | 3         | 18           | 6            |
| **Total**                   | **12** | -         | -         | **69**       | **84**       |

**Interpretation:**

- For **performance-critical** or **stateful** plugins: NOC wins (84 vs 69)
- For **quick prototypes** or **language-agnostic** integrations: OMO is sufficient
- For **production plugins** with long-term maintenance: NOC's type safety and ecosystem win

---

## Hybrid Approach

For complex systems, consider combining both:

1. **Use NOC for core orchestration**
   - High-performance event handling
   - State management
   - OpenCode API integration

2. **Use OMO for external integrations**
   - Trigger external services via subprocess hooks
   - Keep heavy computation isolated
   - Maintain language flexibility

**Example architecture:**

```typescript
// NOC hook (in-process)
export const plugin = createPlugin({
  async toolExecuteAfter(ctx, result) {
    // Fast stateful logic
    if (result.status === 'success') {
      // Trigger external service via OMO-style subprocess
      await runSubprocess('notify-service', { data: result });
    }
  },
});
```

---

## Conclusion

Neither system is universally superior—each excels in different scenarios:

- **oh-my-opencode** is the right choice for quick, language-agnostic integrations where setup simplicity and isolation matter more than performance
- **Native OpenCode** is the right choice for performance-critical, stateful, or deeply integrated plugins requiring full SDK access and TypeScript ecosystem benefits

The decision should be guided by your specific requirements: performance needs, state requirements, team expertise, and long-term maintenance considerations.
