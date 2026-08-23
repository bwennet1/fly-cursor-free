/**
 * CDP MouseEvent.screenX / screenY patcher.
 *
 * Chrome DevTools Protocol leaves screenX/screenY equal to clientX/clientY
 * (often 0 offset). Cloudflare Turnstile treats that as a bot signal.
 *
 * Upstream technique (several forks of the same idea):
 *   https://github.com/TheFalloutOf76/CDP-bug-MouseEvent-.screenX-.screenY-patcher
 *   https://github.com/Xewdy444/CDP-bug-MouseEvent-.screenX-.screenY-patcher
 *
 * Cursor-Register / cursor-auto-free ship a fixed-value defineProperty version.
 * The getter form (clientX + random offset) matches what Turnstile actually
 * checks and is what any-auto-register injects via add_init_script.
 *
 * This is NOT a Turnstile solver — it only patches the CDP fingerprint.
 */
(function () {
    var offsetX = Math.floor(Math.random() * (1200 - 800 + 1)) + 800;
    var offsetY = Math.floor(Math.random() * (600 - 400 + 1)) + 400;

    try {
        Object.defineProperty(MouseEvent.prototype, "screenX", {
            get: function () {
                return this.clientX + offsetX;
            },
            configurable: true,
        });
        Object.defineProperty(MouseEvent.prototype, "screenY", {
            get: function () {
                return this.clientY + offsetY;
            },
            configurable: true,
        });
    } catch (_) {}

    if (typeof PointerEvent !== "undefined") {
        try {
            Object.defineProperty(PointerEvent.prototype, "screenX", {
                get: function () {
                    return this.clientX + offsetX;
                },
                configurable: true,
            });
            Object.defineProperty(PointerEvent.prototype, "screenY", {
                get: function () {
                    return this.clientY + offsetY;
                },
                configurable: true,
            });
        } catch (_) {}
    }
})();
