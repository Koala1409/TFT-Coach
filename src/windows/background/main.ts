/**
 * Background controller (hidden window, no React).
 * Owns window lifecycle, hotkeys and the GEP service; publishes TftGameState to the overlay.
 */
import { HOTKEY_TOGGLE_OVERLAY, WINDOWS } from '../../shared/constants';
import { isOverwolf, isTftGame, ow } from '../../shared/overwolf';
import { initDdragon } from '../../services/ddragonService';
import { GepService, type GepUpdate } from '../../services/gepService';
import { initMeta } from '../../services/metaService';
import { clearGameState, publishGameState } from '../../services/stateSync';

const log = (...args: unknown[]) => console.log('[background]', ...args);

/** Don't hold GEP startup hostage to a slow network: item canonicalization falls back without it. */
const DDRAGON_WAIT_MS = 3000;

class BackgroundController {
  /** Game id 5426 is running — could be TFT *or* League. */
  private gameRunning = false;
  /** GEP confirmed this is a TFT match. */
  private isTft = false;
  /** Overlay auto-opened once this session; afterwards the user's Alt+X choice wins. */
  private overlayOpened = false;
  private gep = new GepService((u) => this.onGepUpdate(u));
  private ddragonReady: Promise<unknown> = Promise.resolve();

  async start(): Promise<void> {
    // Warm the shared Data Dragon cache so the overlay renders icons instantly.
    this.ddragonReady = initDdragon().then((d) => log('ddragon ready:', d?.version ?? 'unavailable'));
    // Warm the shared meta-comps cache (remote comps.json, 6 h TTL) for the overlay.
    void initMeta().then((m) => log(`meta: ${m.db.comps.length} comps (${m.source})`));

    overwolf.games.onGameInfoUpdated.addListener(this.onGameInfoUpdated);
    overwolf.settings.hotkeys.onPressed.addListener(this.onHotkey);
    overwolf.extensions.onAppLaunchTriggered.addListener(this.onAppLaunch);

    log('started');
    await this.setGameRunning(isTftGame(await ow.runningGame()));
  }

  private async setGameRunning(running: boolean): Promise<void> {
    this.gameRunning = running;
    this.isTft = false;
    this.overlayOpened = false;
    clearGameState();

    if (running) {
      await ow.close(WINDOWS.desktop);
      await ow.close(WINDOWS.overlayPreview);
      await Promise.race([this.ddragonReady, new Promise((r) => setTimeout(r, DDRAGON_WAIT_MS))]);
      if (this.gameRunning) this.gep.start();
    } else {
      this.gep.stop();
      await ow.close(WINDOWS.inGame);
      await ow.show(WINDOWS.desktop);
    }
  }

  private onGepUpdate({ state, isTft }: GepUpdate): void {
    if (state.gameMode === 'LOL') {
      log('regular League game — overlay stays closed, GEP stopped');
      this.gep.stop();
      return;
    }
    publishGameState(state);
    if (isTft && !this.isTft) {
      this.isTft = true;
      log('TFT match detected');
    }
    if (this.isTft && !this.overlayOpened) {
      this.overlayOpened = true;
      void ow.show(WINDOWS.inGame);
    }
  }

  private onGameInfoUpdated = async (e: Overwolf.GameInfoUpdatedEvent): Promise<void> => {
    if (!e.runningChanged && !e.gameChanged) return;
    const running = isTftGame(e.gameInfo);
    if (running === this.gameRunning) return;
    log('game running changed:', running);
    await this.setGameRunning(running);
  };

  private onHotkey = async (e: Overwolf.HotkeyPressedEvent): Promise<void> => {
    if (e.name !== HOTKEY_TOGGLE_OVERLAY) return;
    // In a TFT match: toggle the real overlay. Otherwise: the desktop preview (if the user opened it).
    if (this.gameRunning && this.isTft) await ow.toggle(WINDOWS.inGame);
    else if (!this.gameRunning) await ow.toggle(WINDOWS.overlayPreview);
  };

  /** User clicked the dock icon. */
  private onAppLaunch = async (): Promise<void> => {
    if (this.gameRunning && this.isTft) await ow.show(WINDOWS.inGame);
    else if (!this.gameRunning) await ow.show(WINDOWS.desktop);
  };
}

if (isOverwolf()) {
  void new BackgroundController().start();
} else {
  log('not running inside Overwolf — background controller idle.');
}
