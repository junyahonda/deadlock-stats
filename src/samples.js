// Keep full snapshots out of the first-load bundle.
export const sampleProfiles = [
  { id: 399289886, profile: { personaname: "C9 Average" } },
  { id: 278919272, profile: { personaname: "Parzelion" } },
  { id: 895035338, profile: { personaname: "imduckies" } },
];

export async function loadSample(id) {
  const { default: snapshots } = await import("./samples.json");
  const sample = snapshots.find((player) => player.id === Number(id));
  if (!sample) throw new Error("That saved demo is not available.");
  return sample;
}
