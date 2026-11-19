// Older Android WebViews can run the bundled game but omit newer DOM conveniences.
if (typeof window.globalThis === "undefined") window.globalThis = window;
if (!Object.fromEntries) {
  Object.fromEntries = entries => {
    const result = {};
    for (const [key, value] of entries) {
      Object.defineProperty(result, key, {value, configurable:true, enumerable:true, writable:true});
    }
    return result;
  };
}
if (!Object.hasOwn) Object.hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);

const mediaPrototype = Object.getPrototypeOf(window.matchMedia("screen"));
if (!mediaPrototype.addEventListener && mediaPrototype.addListener) {
  mediaPrototype.addEventListener = function(type, listener) { if (type === "change") this.addListener(listener); };
  mediaPrototype.removeEventListener = function(type, listener) { if (type === "change") this.removeListener(listener); };
}

// Only the listener cancellation API is used by the game. Detect the actual browser
// behavior: several WebView releases have AbortController but ignore the signal option.
if (!window.AbortController) {
  window.AbortController = class {
    constructor() { this.signal = document.createDocumentFragment(); this.signal.aborted = false; }
    abort() {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      this.signal.dispatchEvent(new Event("abort"));
    }
  };
}
function hasListenerCancellation() {
  const element = document.createElement("i");
  const controller = new AbortController();
  let called = false;
  element.addEventListener("orbit-check", () => { called = true; }, {signal:controller.signal});
  controller.abort();
  element.dispatchEvent(new Event("orbit-check"));
  return !called;
}
if (!hasListenerCancellation()) {
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    const signal = options && options.signal;
    if (!signal) return add.call(this, type, listener, options);
    if (signal.aborted) return;
    add.call(this, type, listener, options);
    add.call(signal, "abort", () => this.removeEventListener(type, listener, !!options.capture), {once:true});
  };
}
