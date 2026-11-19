import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_KEY, STORAGE_KEY, createCampaign } from "../courier/gameplay.mjs";
import { createRenderBudget, setQualityPreference } from "../mobile-quality.js";

// Produced by the published 1.1.0 gameplay engine after docking at the Moon,
// buying an engine and saving halfway through the Mars survey.
const existingCareer = {
  version:1, started:true, missionIndex:1, active:true, progress:0.5, credits:10,
  upgrades:{engine:1, scanner:0, shield:0}, visited:["moon"], discovered:[],
  settings:{quality:"auto", sensitivity:1, invertY:true, sound:true, haptics:true},
  stats:{contracts:1, scans:0, distance:0}, shield:100, energy:100, cargo:0,
};
function storage(entries) {
  const map = new Map(entries);
  return {getItem:key => map.get(key) ?? null, setItem:(key,value) => map.set(key,value)};
}

for (const recoverBackup of [false, true]) {
  test(recoverBackup ? "recovers a 1.1.0 career after an interrupted primary write"
    : "resumes a half-completed 1.1.0 survey and awards the contract once", () => {
    const old = JSON.stringify(existingCareer);
    const disk = storage([[STORAGE_KEY, recoverBackup ? old.slice(0, 50) : old], [BACKUP_KEY, old]]);
    const career = createCampaign(disk);
    assert.deepEqual(career.state, existingCareer);
    assert.equal(career.getMission().target, "mars");
    const atMars = {targetKey:"mars", near:true, stable:true};
    assert.equal(career.scan(2, atMars), true);
    assert.equal(career.scan(2, atMars), false);
    const reopened = createCampaign(disk).state;
    assert.equal(reopened.credits, 230);
    assert.equal(reopened.missionIndex, 2);
    assert.equal(reopened.upgrades.engine, 1);
    assert.equal(reopened.settings.invertY, true);
    assert.deepEqual(reopened.discovered, ["mars"]);
  });
}

test("portrait and landscape render targets stay within their mobile buffer limits", () => {
  try {
    for (const [preference, maxPixels, maxEdge] of [["low",620000,1536],["high",2100000,2560]]) {
      setQualityPreference(preference);
      const budget = createRenderBudget();
      for (const [width,height] of [[432,960],[1200,800],[7680,2160],[2160,7680]]) {
        const dpr = budget.pixelRatio(width,height);
        const w = Math.floor(width*dpr), h = Math.floor(height*dpr);
        assert.ok(w > 0 && h > 0 && w*h <= maxPixels);
        assert.ok(Math.max(w,h) <= maxEdge);
      }
    }
  } finally {
    setQualityPreference("auto");
  }
});
