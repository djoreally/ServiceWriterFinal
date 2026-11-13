import { render, screen } from "@testing-library/react";
import ShellErrorBoundary from "@/components/routing/ShellErrorBoundary";
import { recoverFromStaleChunk } from "@/lib/chunkRecovery";

jest.mock("@/lib/chunkRecovery", () => ({
  ...jest.requireActual("@/lib/chunkRecovery"),
  recoverFromStaleChunk: jest.fn(() => true),
}));

const recoverMock = recoverFromStaleChunk as jest.MockedFunction<
  typeof recoverFromStaleChunk
>;

function ChunkChild(): never {
  throw new Error(
    "Failed to fetch dynamically imported module: https://servicewriter.xyz/assets/chunk-abc123.js"
  );
}

function BrokenChild(): never {
  throw new Error("boom: internal detail that must not render");
}

describe("ShellErrorBoundary", () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    recoverMock.mockClear();
    recoverMock.mockReturnValue(true);
    // React logs caught render errors; silence them for readable output.
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("renders children when nothing throws", () => {
    render(
      <ShellErrorBoundary>
        <p>app content</p>
      </ShellErrorBoundary>
    );
    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("runs chunk recovery and keeps the branded skeleton up on a stale-chunk error", () => {
    render(
      <ShellErrorBoundary>
        <ChunkChild />
      </ShellErrorBoundary>
    );
    expect(recoverMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByLabelText("Loading Service Writer")
    ).toBeInTheDocument();
  });

  it("falls back to the branded card when the recovery budget is spent", () => {
    recoverMock.mockReturnValue(false);
    render(
      <ShellErrorBoundary>
        <ChunkChild />
      </ShellErrorBoundary>
    );
    expect(recoverMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Reload" })
    ).toBeInTheDocument();
  });

  it("shows the branded card — never the raw error — for non-chunk errors", () => {
    render(
      <ShellErrorBoundary>
        <BrokenChild />
      </ShellErrorBoundary>
    );
    expect(recoverMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Reload" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
  });
});
