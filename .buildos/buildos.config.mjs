export default {
  pinnedToolchain: { node: "24.x" },
  gates: {
    async preGate({ phase, state }) {
      if (!state.currentTask) throw new Error("BuildOS currentTask is required.");
      if (!["check", "verify"].includes(phase)) return;
    },
    async verify() {
      // Repository-specific executable checks are declared in buildos.config.json.
      // Production verification remains exact-SHA and journey-specific.
    }
  }
};
