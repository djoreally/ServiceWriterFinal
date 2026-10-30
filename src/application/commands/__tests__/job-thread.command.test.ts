import { jest } from "@jest/globals";

jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "ApiClientError";
    }
  },
}));

import { sendJobThreadHumanMessage } from "../job-thread.command";
import { apiClient } from "@/lib/api-client";

const post = apiClient.post as any;

// The command posts to /v1/job-threads/messages; the Hono route behind it
// invokes the permission-checked, idempotent send_job_thread_message_v2
// RPC with these fields (p_recipient, p_client_message_id, ...). These
// tests pin the client half of that contract.
describe("sendJobThreadHumanMessage", () => {
  beforeEach(() => post.mockReset());

  it("sends the dispatch message with the RPC contract fields (null recipient, stable client message id)", async () => {
    post.mockResolvedValue({ data: { message_id: "message-1", thread_id: "thread-1" } });
    await sendJobThreadHumanMessage({
      jobId: "job-1", jobSource: "fleet_work_order", content: "Need access",
      senderRole: "technician", channel: "dispatch", clientMessageId: "client-1",
    });
    expect(post).toHaveBeenCalledWith("/v1/job-threads/messages", expect.objectContaining({
      job_id: "job-1", job_source: "fleet_work_order", channel: "dispatch",
      recipient: null, client_message_id: "client-1",
    }));
  });

  it("passes the explicitly selected external recipient", async () => {
    post.mockResolvedValue({ data: { message_id: "message-2", thread_id: "thread-2" } });
    await sendJobThreadHumanMessage({
      jobId: "job-2", jobSource: "appointment", content: "Running late",
      senderRole: "technician", channel: "customer_sms", recipient: "+15555550100", clientMessageId: "client-2",
    });
    expect(post).toHaveBeenCalledWith("/v1/job-threads/messages", expect.objectContaining({
      channel: "customer_sms", recipient: "+15555550100",
    }));
  });
});
