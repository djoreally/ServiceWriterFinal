import { nextApi } from "../nextApiClient";

describe("nextApi appointments pagination", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("loads appointments beyond the first API page", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: `old-${index}` }));
    const newestBooking = { id: "new-public-booking" };
    const response = (data: unknown[]) => Promise.resolve({
      ok: true,
      json: async () => ({ data }),
    } as Response);
    const fetchMock = jest.fn()
      .mockImplementationOnce(() => response(firstPage))
      .mockImplementationOnce(() => response([newestBooking]));
    globalThis.fetch = fetchMock;

    const result = await nextApi.appointments.list("11111111-1111-4111-8111-111111111111");

    expect(result.data).toHaveLength(101);
    expect(result.data.at(-1)).toEqual(newestBooking);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("limit=100&offset=0"),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("limit=100&offset=100"),
      expect.any(Object),
    );
  });
});
