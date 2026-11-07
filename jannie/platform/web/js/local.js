// The table in the browser: the game server compiled to WebAssembly
// (cmd/yasat-wasm) runs in this page, and LocalSocket talks to it the way
// main.js talks to a WebSocket. There is no network and no other player:
// a table lives as long as the page.
const BASE = new URL('../', import.meta.url);
let ready = null;

// Loads wasm_exec.js and the table once; resolves when jannieConnect is there.
function load() {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('wasm_exec.js', BASE).href;
    s.onerror = () => reject(new Error('wasm_exec.js'));
    s.onload = async () => {
      try {
        const go = new globalThis.Go();
        const url = new URL('table.wasm', BASE).href;
        const res = await fetch(url);
        const { instance } = WebAssembly.instantiateStreaming
          ? await WebAssembly.instantiateStreaming(res, go.importObject).catch(async () =>
            WebAssembly.instantiate(await (await fetch(url)).arrayBuffer(), go.importObject))
          : await WebAssembly.instantiate(await res.arrayBuffer(), go.importObject);
        go.run(instance); // main sets jannieConnect, then blocks forever
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    document.head.append(s);
  });
  ready.catch(() => { ready = null; });
  return ready;
}

export class LocalSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor() {
    this.readyState = LocalSocket.CONNECTING;
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    load().then(() => {
      if (this.readyState !== LocalSocket.CONNECTING) return;
      // Messages from the table arrive in a task of their own, never in the
      // middle of a call into it.
      this.conn = globalThis.jannieConnect(
        data => setTimeout(() => { if (this.readyState === LocalSocket.OPEN) this.onmessage?.({ data }); }),
        () => setTimeout(() => this.ended()));
      this.readyState = LocalSocket.OPEN;
      this.onopen?.({});
    }).catch(e => {
      console.error('table', e);
      this.ended();
    });
  }

  send(text) {
    if (this.readyState !== LocalSocket.OPEN) throw new Error('LocalSocket is not open');
    this.conn.send(String(text));
  }

  close() {
    if (this.readyState >= LocalSocket.CLOSING) return;
    this.conn?.close();
    setTimeout(() => this.ended());
  }

  ended() {
    if (this.readyState === LocalSocket.CLOSED) return;
    this.readyState = LocalSocket.CLOSED;
    this.onclose?.({});
  }
}
