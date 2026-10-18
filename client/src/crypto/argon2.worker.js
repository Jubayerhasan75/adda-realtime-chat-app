// Runs Argon2id off the main thread (docs/E2EE.md §2). The worker is created for one
// derivation and then terminated, so its 64 MiB of WebAssembly memory is given back at once
// and the screen never freezes while the passphrase is checked.
import { argon2id } from 'hash-wasm';

self.onmessage = async ({ data }) => {
  try {
    const hash = await argon2id({ ...data, outputType: 'binary' });
    self.postMessage({ ok: true, hash }, [hash.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, message: err.message });
  }
};
