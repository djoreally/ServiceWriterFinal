import { jest } from "@jest/globals";

jest.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: jest.fn(), auth: { getUser: jest.fn() } },
}));

import { sendJobThreadHumanMessage } from "../job-thread.command";
import { supabase } from "@/integrations/supabase/client";

const rpc = supabase.rpc as any;

describe("sendJobThreadHumanMessage", () => {
  beforeEach(() => rpc.mockReset());

  it("uses the permission-checked, idempotent dispatch RPC", async () => {
    rpc.mockResolvedValue({ data: { message_id: "message-1" }, error: null });
    await sendJobThreadHumanMessage({
      jobId: "job-1", jobSource: "fleet_work_order", content: "Need access",
      senderRole: "technician", channel: "dispatch", clientMessageId: "client-1",
    });
    expect(rpc).toHaveBeenCalledWith("send_job_thread_message_v2", expect.objectContaining({
      p_job_id: "job-1", p_job_source: "fleet_work_order", p_channel: "dispatch",
      p_recipient: null, p_client_message_id: "client-1",
    }));
  });

  it("passes the explicitly selected external recipient", async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await sendJobThreadHumanMessage({
      jobId: "job-2", jobSource: "appointment", content: "Running late",
      senderRole: "technician", channel: "customer_sms", recipient: "+15555550100", clientMessageId: "client-2",
    });
    expect(rpc).toHaveBeenCalledWith("send_job_thread_message_v2", expect.objectContaining({
      p_channel: "customer_sms", p_recipient: "+15555550100",
    }));
  });
});
