# Swarm Tools Architectural Patterns: Durable Streams, Event Sourcing, & Actor Model

This document outlines the core architectural patterns powering high-integrity multi-agent systems. It combines the concepts of **Durable Streams** (the primitive), **Event Sourcing** (the state management), and the **Actor Model** (the coordination).

---

## 1. Durable Streams: The Immutable Backbone

**Concept:**
A Durable Stream is an append-only, ordered, and immutable sequence of data records. Unlike a traditional message queue that deletes data after consumption, a Durable Stream persists history. This allows readers to "time-travel" by reading from any historical offset.

### ASCII Architecture: Durable Stream
```text
+-----------------------------------------------------------------------+
|                           DURABLE STREAM (Log)                        |
+-----------------------------------------------------------------------+
| Offset: 0 | Offset: 1 | Offset: 2 | Offset: 3 |       ...             |
+-----------+-----------+-----------+-----------+-----------------------+
|  Event A  |  Event B  |  Event C  |  Event D  | [Next Write Head] ->  |
+-----------+-----------+-----------+-----------+-----------------------+
      ^           ^                                     |
      |           |                                     |
 [Replay]    [Real-time]                           [Append]
  Reader      Consumer                              Writer
```

### TypeScript Implementation
```typescript
export interface StreamRecord<T> {
  offset: number;
  timestamp: number;
  payload: T;
}

export class DurableStream<T> {
  private log: StreamRecord<T>[] = []; // In production, this is a PGLite/Postgres table

  /**
   * Appends a record to the end of the stream.
   * Returns the offset of the new record.
   */
  async append(payload: T): Promise<number> {
    const offset = this.log.length;
    this.log.push({
      offset,
      timestamp: Date.now(),
      payload
    });
    return offset;
  }

  /**
   * Reads a slice of the stream starting from a specific offset.
   * Enables resumable consumption and state replay.
   */
  async readFrom(offset: number, limit: number = 100): Promise<StreamRecord<T>[]> {
    return this.log.slice(offset, offset + limit);
  }
}
```

---

## 2. Event Sourcing: The State Engine

**Concept:**
Instead of storing the *current state* of a task or agent, we store the *sequence of events* that led to that state. The current state is a "Materialized View" computed by "folding" (reducing) the events from the Durable Stream.

### ASCII Architecture: Event Sourcing Flow
```text
   [Command]                [Durable Stream]               [State]
"Complete Task"             (Source of Truth)             (Reduced)
      |                            |                          |
      v                            |                          |
+------------+    Valid?    +-------------+   Fold/    +-----------+
|  Decision  | -----------> | TaskCreated | ---------->| Status:   |
|   Logic    |              | TaskStarted |   Reduce   | COMPLETED |
+------------+              | TaskDone    | <--------- +-----------+
                                   ^
                                   |
                             (New Append)
```

### TypeScript Implementation
```typescript
type TaskStatus = 'new' | 'assigned' | 'completed';

interface TaskEvent {
  type: 'TASK_CREATED' | 'TASK_ASSIGNED' | 'TASK_COMPLETED';
  data: any;
}

interface TaskState {
  id: string | null;
  status: TaskStatus;
  assignee: string | null;
}

// The Reducer: A pure function representing state transitions
const taskReducer = (state: TaskState, event: TaskEvent): TaskState => {
  switch (event.type) {
    case 'TASK_CREATED':
      return { ...state, id: event.data.id, status: 'new' };
    case 'TASK_ASSIGNED':
      return { ...state, status: 'assigned', assignee: event.data.agentId };
    case 'TASK_COMPLETED':
      return { ...state, status: 'completed' };
    default:
      return state;
  }
};

class TaskAggregate {
  constructor(private stream: DurableStream<TaskEvent>) {}

  // Rebuild state from history (Event Replay)
  async getState(): Promise<TaskState> {
    let state: TaskState = { id: null, status: 'new', assignee: null };
    const history = await this.stream.readFrom(0);
    return history.reduce((acc, record) => taskReducer(acc, record.payload), state);
  }
}
```

---

## 3. The Actor Model: Swarm Coordination

**Concept:**
Agents are "Actors"—independent units of execution that do not share state. They communicate exclusively via messages sent to each other's Inboxes. Each Inbox is a **Durable Stream**, ensuring that even if an Agent crashes, its messages are preserved and can be processed upon restart.

### ASCII Architecture: Actor Model Flow
```text
      [Sender Agent]                  [Receiver Agent (Actor)]
            |                                     |
            | (Append Event)                      | (Poll/Read Cursor)
            v                                     v
    +------------------+                  +------------------+
    | Receiver's Inbox | ---------------->| Message Handler  |
    | (Durable Stream) |   Next Offset    | (Logic + State)  |
    +------------------+                  +------------------+
            ^                                     |
            |                                     | (Reply)
            +-------------------------------------+
```

### TypeScript Implementation
```typescript
interface Message<T> {
  from: string;
  to: string;
  payload: T;
}

abstract class SwarmActor<TMsg> {
  // Every Actor has a Durable Stream as an Inbox
  public inbox = new DurableStream<Message<TMsg>>();
  private cursor: number = 0; // Tracks last processed message

  constructor(public agentName: string) {}

  /**
   * The Run-Loop: Consumes messages from the durable inbox
   */
  async processInbox() {
    while (true) {
      const messages = await this.inbox.readFrom(this.cursor);
      for (const msg of messages) {
        await this.onMessage(msg.payload);
        this.cursor = msg.offset + 1; // Checkpoint progress
      }
      await new Promise(r => setTimeout(r, 1000)); // Polling delay
    }
  }

  abstract onMessage(msg: Message<TMsg>): Promise<void>;

  /**
   * Communication: Append to another agent's inbox
   */
  async send(target: SwarmActor<any>, payload: any) {
    await target.inbox.append({
      from: this.agentName,
      to: target.agentName,
      payload
    });
  }
}
```

---

## 4. Integration: The Swarm Orchestration

In a Swarm Tools environment, these patterns converge as follows:

1.  **Durable Streams** provide the persistence layer (PGLite).
2.  **Event Sourcing** tracks the lifecycle of "Cells" (Tasks) and "Epics".
3.  **The Actor Model** allows parallel Workers to coordinate with the Coordinator via Swarm Mail (Durable Inboxes).

### Summary of Benefits
*   **Context Death Survival:** Because the inbox and state are in a Durable Stream, a new LLM session can resume exactly from the last `cursor` offset.
*   **Auditability:** Every inter-agent message and state change is preserved in the event log.
*   **Concurrency:** The Actor Model prevents race conditions by isolating state and processing messages sequentially per agent.
*   **Fault Tolerance:** Crashed agents restart and "catch up" by replaying the stream from their last checkpoint.
