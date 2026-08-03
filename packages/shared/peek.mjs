import { generateUniverse } from "./src/index.ts";
const u = generateUniverse("44ca0233");
const home = u.galaxies[0];
const homeSys = home.systems.find((s) =>
  s.planets.some((p) => p.name.startsWith("Dagon")),
);
console.log(
  "home:",
  homeSys.id,
  homeSys.name,
  "station:",
  homeSys.station?.name ?? "none",
);
for (const s of home.systems) {
  if (s.station) console.log("station:", s.id, s.name, s.station.factionId);
}
console.log(
  "links from home:",
  JSON.stringify(home.links.filter((l) => l.includes(homeSys.id))),
);
