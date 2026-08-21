import { useAppBootstrapStore } from "@/stores/appBootstrapStore";

describe("useAppBootstrapStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppBootstrapStore.setState({
      bootstrapped: false,
      bootError: null,
      hasBooted: false,
      bootInFlight: false,
    });
  });

  it("marks the app shell ready without tenant or auth network work", async () => {
    await useAppBootstrapStore.getState().bootAsync();

    expect(useAppBootstrapStore.getState()).toMatchObject({
      bootstrapped: true,
      bootError: null,
      hasBooted: true,
      bootInFlight: false,
    });
  });
});
