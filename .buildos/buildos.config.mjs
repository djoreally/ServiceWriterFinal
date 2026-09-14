export default {
  gates: {
    async preGate({ phase }) {
      if (!["check", "verify"].includes(phase)) throw new Error("Unknown BuildOS gate phase.");
    },
    async verify({ phase }) {
      if (phase === "verify" && process.env.CI && process.env.GITHUB_EVENT_NAME === "pull_request") {
        // CI itself is the independent verifier. No self-certification is allowed here.
      }
    },
  },
};
