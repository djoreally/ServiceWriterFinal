import { readTechMissionBoardCache, saveTechMissionBoardCache } from "@/lib/tech-offline-cache";
import { buildTechMissionBoard, type TechMissionJob } from "@/lib/tech-mission-board";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

const job: TechMissionJob = {
  id: "job-1",
  scheduled_date: "2026-07-30",
  scheduled_time: "09:00",
  dispatch_status: "assigned",
  status: "scheduled",
  job_priority: "normal",
};

describe("tech-offline-cache", () => {
  it("round-trips a mission board cache for the same technician user", () => {
    const storage = memoryStorage();
    const board = buildTechMissionBoard([job], "2026-07-30");

    saveTechMissionBoardCache("user-1", board, [job], storage);

    expect(readTechMissionBoardCache("user-1", storage)?.missionBoard.currentJob?.id).toBe("job-1");
    expect(readTechMissionBoardCache("user-2", storage)).toBeNull();
  });
});
