// Drives the local copy of the original 2048 (vendor/2048) in a headed Chromium.
//
// The game writes its full state to localStorage.gameState inside the keydown handler,
// so it is readable as soon as keyboard.press() resolves. On game over that key is
// cleared and .game-message gets the "game-over" class a frame later.

import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import type { Board, Direction } from "./board.ts";

const GAME_URL = `file://${path.resolve("vendor/2048/index.html")}`;

const KEYS: Record<Direction, string> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

export interface GameState {
  board: Board;
  score: number;
  over: boolean;
}

interface StoredCell {
  value: number;
}
interface StoredState {
  grid: { cells: (StoredCell | null)[][] };
  score: number;
  won: boolean;
  keepPlaying: boolean;
}

export class Game2048 {
  private constructor(
    private browser: Browser,
    private page: Page,
  ) {}

  // Replaces Math.random with a seeded generator so every player sees the same tiles.
  static async open(seed: number): Promise<Game2048> {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.addInitScript((s: number) => {
      let a = s >>> 0;
      Math.random = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }, seed);
    await page.goto(GAME_URL);
    // The game starts inside requestAnimationFrame, so its first state can lag the load.
    await page.waitForFunction(() => localStorage.getItem("gameState") !== null);
    return new Game2048(browser, page);
  }

  async read(): Promise<GameState> {
    const raw = await this.page.evaluate(() => localStorage.getItem("gameState"));
    if (!raw) {
      // Game over clears the state at once but shows the message on the next animation
      // frame, so wait for it. The score is the first text node of .score-container.
      await this.page.locator(".game-message.game-over").waitFor({ timeout: 5000 });
      const score = await this.page
        .locator(".score-container")
        .evaluate((el) => Number(el.firstChild?.textContent ?? 0));
      return { board: [], score, over: true };
    }

    const s = JSON.parse(raw) as StoredState;

    // Reaching 2048 pauses the game; carry on so runs can go past it.
    if (s.won && !s.keepPlaying) await this.page.locator(".keep-playing-button").click();

    // Stored grid is cells[col][row]; convert to board[row][col].
    const cells = s.grid.cells;
    const board = cells[0]!.map((_, row) => cells.map((col) => col[row]?.value ?? 0));
    return { board, score: s.score, over: false };
  }

  async press(dir: Direction): Promise<void> {
    await this.page.keyboard.press(KEYS[dir]);
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
