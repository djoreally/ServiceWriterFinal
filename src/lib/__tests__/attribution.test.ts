import {
  attributionProps,
  captureAttribution,
  getAttribution,
  resolveBookingSource,
  withCurrentQuery,
} from "@/lib/attribution";

const STORAGE_KEY = "sw_attribution_v1";

function setUrl(path: string) {
  window.history.replaceState(null, "", path);
}

beforeEach(() => {
  window.sessionStorage.removeItem(STORAGE_KEY);
  setUrl("/");
});

describe("attribution", () => {
  describe("captureAttribution", () => {
    it("captures UTM params and landing path from the URL", () => {
      setUrl("/?utm_source=google&utm_medium=cpc&utm_campaign=spring");
      const snapshot = captureAttribution("public_booking");

      expect(snapshot).not.toBeNull();
      expect(snapshot?.utm_source).toBe("google");
      expect(snapshot?.utm_medium).toBe("cpc");
      expect(snapshot?.utm_campaign).toBe("spring");
      expect(snapshot?.landing_path).toBe("/");
      expect(snapshot?.channel).toBe("public_booking");
      expect(typeof snapshot?.captured_at).toBe("string");
    });

    it("first capture wins — later navigation never overwrites", () => {
      setUrl("/?utm_source=google");
      const first = captureAttribution("public_booking");
      setUrl("/?utm_source=facebook");
      const second = captureAttribution("provider_directory");

      expect(second).toEqual(first);
      expect(second?.utm_source).toBe("google");
      expect(second?.channel).toBe("public_booking");
    });

    it("persists the snapshot to session storage", () => {
      setUrl("/?utm_source=google");
      captureAttribution("public_booking");
      expect(getAttribution()?.utm_source).toBe("google");
    });
  });

  describe("getAttribution", () => {
    it("returns null when nothing was captured", () => {
      expect(getAttribution()).toBeNull();
    });
  });

  describe("attributionProps", () => {
    it("returns an empty bag when nothing was captured", () => {
      expect(attributionProps()).toEqual({});
    });

    it("flattens the snapshot into analytics-safe props", () => {
      setUrl("/?utm_source=google&utm_term=oil+change");
      captureAttribution("provider_directory");
      const props = attributionProps();
      expect(props.attribution_channel).toBe("provider_directory");
      expect(props.utm_source).toBe("google");
      expect(props.utm_term).toBe("oil change");
      expect(props.landing_path).toBe("/");
    });
  });

  describe("resolveBookingSource", () => {
    it("falls back to the caller default without attribution", () => {
      expect(resolveBookingSource()).toBe("public_booking");
      expect(resolveBookingSource("walk_in")).toBe("walk_in");
    });

    it("resolves provider_directory channel directly", () => {
      setUrl("/");
      captureAttribution("provider_directory");
      expect(resolveBookingSource()).toBe("provider_directory");
    });

    it("prefixes utm sources", () => {
      setUrl("/?utm_source=chatgpt.com");
      captureAttribution("public_booking");
      expect(resolveBookingSource()).toBe("utm:chatgpt.com");
    });
  });

  describe("withCurrentQuery", () => {
    it("appends the current query string to a bare URL", () => {
      setUrl("/?utm_source=google");
      expect(withCurrentQuery("https://book.example.com/apex")).toBe(
        "https://book.example.com/apex?utm_source=google",
      );
    });

    it("merges with an existing query string", () => {
      setUrl("/?utm_source=google");
      expect(withCurrentQuery("https://book.example.com/apex?a=1")).toBe(
        "https://book.example.com/apex?a=1&utm_source=google",
      );
    });

    it("returns the URL unchanged without a query string", () => {
      setUrl("/book");
      expect(withCurrentQuery("https://book.example.com/apex")).toBe(
        "https://book.example.com/apex",
      );
    });
  });
});
