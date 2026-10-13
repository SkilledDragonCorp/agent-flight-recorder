import { randomUUID } from "node:crypto";

export type ApprovalStatus = "pending" | "approved" | "denied" | "timed_out";

export interface ApprovalRequest {
  id: string;
  server: string;
  tool: string;
  args: unknown;
  createdAt: number;
  status: ApprovalStatus;
  resolve: (status: "approved" | "denied" | "timed_out") => void;
}

export class ApprovalBroker {
  private pending = new Map<string, ApprovalRequest>();
  readonly timeoutMs: number;

  constructor(timeoutSec = Number(process.env.SDFR_APPROVAL_TIMEOUT_SEC ?? 120)) {
    this.timeoutMs = timeoutSec * 1000;
  }

  listPending(): ApprovalRequest[] {
    return [...this.pending.values()].map(({ resolve: _r, ...rest }) => rest as ApprovalRequest);
  }

  decide(id: string, status: "approved" | "denied"): boolean {
    const req = this.pending.get(id);
    if (!req || req.status !== "pending") return false;
    req.status = status;
    req.resolve(status);
    this.pending.delete(id);
    return true;
  }

  /** Auto-approve helper for tests. */
  autoApproveNext(): void {
    for (const [id, req] of this.pending) {
      if (req.status === "pending") {
        this.decide(id, "approved");
        return;
      }
    }
  }

  request(
    server: string,
    tool: string,
    args: unknown,
  ): Promise<"approved" | "denied" | "timed_out"> {
    const id = randomUUID();
    return new Promise((resolve) => {
      const req: ApprovalRequest = {
        id,
        server,
        tool,
        args,
        createdAt: Date.now(),
        status: "pending",
        resolve,
      };
      this.pending.set(id, req);
      const timer = setTimeout(() => {
        if (this.pending.has(id) && req.status === "pending") {
          req.status = "timed_out";
          this.pending.delete(id);
          resolve("timed_out");
        }
      }, this.timeoutMs);
      const original = req.resolve;
      req.resolve = (status) => {
        clearTimeout(timer);
        original(status);
      };
    });
  }
}
