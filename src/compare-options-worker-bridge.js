const originalPostMessage = Worker.prototype.postMessage;

if (!Worker.prototype.__payloadDiffCompareOptionsWrapped) {
  Object.defineProperty(Worker.prototype, '__payloadDiffCompareOptionsWrapped', { value: true });
  Worker.prototype.postMessage = function postMessageWithCompareOptions(message, transfer) {
    let next = message;
    try {
      if (message && typeof message === 'object' && (message.task === 'compare' || message.task === 'compareLive')) {
        next = {
          ...message,
          payload: {
            ...(message.payload || {}),
            options: window.PayloadDiffCompareOptions?.get?.() || {},
          },
        };
      }
    } catch (_) {}

    if (transfer === undefined) return originalPostMessage.call(this, next);
    return originalPostMessage.call(this, next, transfer);
  };
}
