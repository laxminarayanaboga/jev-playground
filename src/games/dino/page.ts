// Drives Chrome's built-in dino game (chrome://dino) in a headed Chromium.
//
// Checked on Chromium 156: goto("chrome://dino") rejects with ERR_INTERNET_DISCONNECTED
// but the game loads (it is the offline error page). The game is an ES module, so there
// is no window.Runner; an init script catches the instance when it registers itself as
// a key listener (addEventListener(type, this)).
//
// In-page code is passed as strings: tsx injects a __name helper into named functions,
// which does not exist inside the page.

import { chromium, type Browser, type Page } from "playwright";

const HOOK = `(() => {
  const orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, l, o) {
    if (l && typeof l === "object" && l.handleEvent && "tRex" in l && !window.__runner) window.__runner = l;
    return orig.call(this, type, l, o);
  };
})()`;

const READ = `(() => {
  const r = window.__runner;
  const t = r.tRex;
  const dm = r.distanceMeter;
  return {
    t: performance.now(),
    playing: r.playing,
    crashed: r.crashed,
    speed: r.currentSpeed,
    msPerFrame: r.msPerFrame,
    score: dm && dm.getActualDistance ? dm.getActualDistance(Math.ceil(r.distanceRan)) : Math.round(r.distanceRan * 0.025),
    trex: { x: t.xPos, y: t.yPos, groundY: t.groundYPos, width: t.config.width, jumping: t.jumping, ducking: t.ducking },
    obstacles: r.horizon.obstacles.map(o => ({
      id: o.__id || (o.__id = (window.__obstacleCount = (window.__obstacleCount || 0) + 1)),
      type: o.typeConfig.type, x: o.xPos, y: o.yPos, width: o.width, speedOffset: o.speedOffset || 0,
    })),
  };
})()`;

// Raw fields for --debug, to check what the score and crash flags really are.
const DEBUG = `(() => {
  const r = window.__runner;
  const dm = r.distanceMeter;
  const dmFields = {};
  for (const k of Object.keys(dm)) { const v = dm[k]; if (typeof v !== "object" || Array.isArray(v)) dmFields[k] = Array.isArray(v) ? v.join("") : v; }
  return {
    distanceRan: Math.round(r.distanceRan),
    actualDistance: dm.getActualDistance ? dm.getActualDistance(Math.ceil(r.distanceRan)) : null,
    highestScore: r.highestScore,
    crashed: r.crashed, playing: r.playing, activated: r.activated, paused: r.paused, playCount: r.playCount,
    speed: +r.currentSpeed.toFixed(2),
    dm: dmFields,
  };
})()`;

export interface RawObstacle {
  id: number; // stamped on the game's obstacle object by READ, stable while it exists
  type: string; // "cactusSmall" | "cactusLarge" | "pterodactyl"
  x: number;
  y: number;
  width: number;
  speedOffset: number;
}

export interface RawState {
  t: number; // page clock, ms
  playing: boolean;
  crashed: boolean;
  speed: number; // px per frame
  msPerFrame: number;
  score: number;
  trex: { x: number; y: number; groundY: number; width: number; jumping: boolean; ducking: boolean };
  obstacles: RawObstacle[];
}

export class DinoGame {
  private ducking = false;

  private constructor(
    private browser: Browser,
    private page: Page,
  ) {}

  static async open(): Promise<DinoGame> {
    // Keep the game running at full speed when the window is covered or unfocused.
    const browser = await chromium.launch({
      headless: false,
      args: [
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        "--disable-background-timer-throttling",
      ],
    });
    const page = await browser.newPage();
    await page.addInitScript(HOOK);
    await page.goto("chrome://dino").catch(() => {}); // rejects by design, see above
    await page.waitForFunction("!!window.__runner", undefined, { timeout: 15000 });
    return new DinoGame(browser, page);
  }

  // Fresh page, e.g. to stop a run that hit the time cap.
  async reload(): Promise<void> {
    this.ducking = false;
    await this.page.goto("chrome://dino").catch(() => {});
    await this.page.waitForFunction("!!window.__runner", undefined, { timeout: 15000 });
  }

  async debug(): Promise<unknown> {
    return this.page.evaluate(DEBUG);
  }

  async read(): Promise<RawState> {
    return (await this.page.evaluate(READ)) as RawState;
  }

  // Starts the first run, or restarts after a crash (the game ignores input briefly after one).
  async start(): Promise<void> {
    await this.page.keyboard.press("Space");
    await this.page.waitForFunction("window.__runner.playing && !window.__runner.crashed", undefined, { timeout: 5000 });
  }

  async jump(): Promise<void> {
    await this.page.keyboard.press("Space");
  }

  async duck(on: boolean): Promise<void> {
    if (on === this.ducking) return;
    this.ducking = on;
    await (on ? this.page.keyboard.down("ArrowDown") : this.page.keyboard.up("ArrowDown"));
  }

  async waitMs(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
