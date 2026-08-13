/* NOCTIX — behaviour. Vanilla, no dependencies, no build step.
 *
 * Three rules this file must never break:
 *   1. Nothing here is allowed to be the reason content stays invisible.
 *      The inline <head> script arms a bailout; the first thing we do is
 *      cancel it, and every feature is individually isolated so one throw
 *      cannot take the others down.
 *   2. The motion preference is read LIVE, never once at load.
 *   3. Exactly one pointer listener exists on the site (the bus below).
 *      No feature may add its own, and no handler reads layout mid-move.
 */

(function () {
  'use strict';

  /* Cancel the head script's bailout timer. First executable line, before
     any feature can throw — if we got here, app.js exists and parsed. */
  if (document.documentElement.__nx) { document.documentElement.__nx(); }

  /* Isolate each feature: a throw disables that feature alone. */
  function feature(name, fn) {
    try { fn(); } catch (e) {
      if (window.console && console.warn) console.warn('noctix: ' + name + ' disabled', e);
    }
  }

  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  /* Live motion preference. Safari <= 13 has no addEventListener on
     MediaQueryList, so both forms are required. */
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var calm = mq.matches;
  var calmWatchers = [];
  var onCalmChange = function (e) {
    calm = e.matches;
    calmWatchers.forEach(function (w) { try { w(calm); } catch (err) {} });
  };
  if (mq.addEventListener) mq.addEventListener('change', onCalmChange);
  else if (mq.addListener) mq.addListener(onCalmChange);

  /* ── Sticky masthead hairline ───────────────────────────────
     An IntersectionObserver sentinel, not a scroll handler: no geometry
     is read, and there is no per-frame work at all. */

  feature('sticky', function () {
    var head = document.querySelector('.masthead');
    if (!head) return;
    var mark = document.createElement('div');
    mark.setAttribute('aria-hidden', 'true');
    mark.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:8px;pointer-events:none';
    document.body.insertBefore(mark, document.body.firstChild);
    new IntersectionObserver(function (entries) {
      head.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(mark);
  });

  /* ── Reveal on scroll ───────────────────────────────────────
     The CSS hide is equal-specificity and the head script guarantees a
     bailout, so this is an enhancement, never a gate. */

  feature('reveal', function () {
    var hidden = document.querySelectorAll('.reveal');
    if (!hidden.length) return;

    var delivered = false;
    var showAll = function () {
      delivered = true;
      each(hidden, function (el) { el.classList.add('is-in'); });
    };

    if (calm || !('IntersectionObserver' in window)) { showAll(); return; }

    var seer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        delivered = true;
        var el = entry.target;
        var wait = parseInt(el.getAttribute('data-delay') || '0', 10);
        setTimeout(function () { el.classList.add('is-in'); }, wait);
        seer.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.1 });
    each(hidden, function (el) { seer.observe(el); });

    /* Only fires if the observer never delivered anything at all — so a
       slow reader no longer has the whole page force-revealed at 3s. */
    setTimeout(function () { if (!delivered) showAll(); }, 3000);

    calmWatchers.push(function (isCalm) { if (isCalm) showAll(); });
  });

  /* ── Count-up stats ─────────────────────────────────────────
     LAW FIX: counting is machine work, and machine motion is linear
     (--e-machine). This shipped with an ease-out cubic — the machine
     decelerating like a hand at the end of the count. Same 1100ms,
     equal steps now. Digit churn cannot jitter the layout: .strip
     .num is --mono with tabular-nums already in the CSS. */

  feature('counters', function () {
    var counters = document.querySelectorAll('[data-count]');
    if (!counters.length || calm || !('IntersectionObserver' in window)) return;

    var seer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        seer.unobserve(el);

        var target = parseFloat(el.getAttribute('data-count'));
        var suffix = el.getAttribute('data-suffix') || '';
        var started = 0;
        var dur = 1100;

        var tick = function (now) {
          if (!started) started = now;
          if (calm) { el.textContent = target + suffix; return; }
          var t = Math.min((now - started) / dur, 1);
          el.textContent = Math.round(target * t) + suffix;
          if (t < 1) requestAnimationFrame(tick);
        };
        el.textContent = '0' + suffix;
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.5 });
    each(counters, function (el) { seer.observe(el); });
  });

  /* ── The console: a scheduled run, not a loop ───────────────
     Each step declares its own duration, so ingesting 38 files visibly
     takes longer than detecting a flight. Deterministic, never random:
     jitter reads as flakiness, which is the opposite of the pitch.
     The same number drives the CSS progress bar and this scheduler.
     Holds are a keyed set — every hold must clear before it resumes. */

  feature('console', function () {
    var stage = document.querySelector('[data-console]');
    if (!stage) return;

    var steps = Array.prototype.slice.call(stage.querySelectorAll('.step'));
    if (!steps.length) return;
    var glyphs = steps.map(function (s) { return s.querySelector('.glyph'); });
    var clock = stage.querySelector('[data-clock]');
    var runs = ['09:00', '21:00'];   /* ET, matching the real cadence */
    var runIdx = 0;
    var timer = 0;
    var holds = Object.create(null);

    var paintDone = function () {
      steps.forEach(function (s, i) {
        s.setAttribute('data-state', 'done');
        if (glyphs[i]) glyphs[i].textContent = '';
      });
    };

    /* Looked up BEFORE the calm return: under reduced motion, and with JS
       blocked, there is no motion to pause, and a visible cursor:pointer
       control that does nothing is worse than no control. It ships hidden
       and is revealed only when a run is actually going to happen. */
    var holdBtn = document.querySelector('[data-hold]');
    var showHold = function (on) { if (holdBtn) holdBtn.hidden = !on; };

    if (calm) { paintDone(); showHold(false); return; }

    /* The markup ships the console COMPLETED, so a visitor without JS sees
       a finished run with all its values rather than six empty rows. When
       JS is present we re-arm to pending immediately — app.js is deferred
       and CSS is render-blocking, so this lands before first paint and
       there is no visible ✓ → · flash. */
    var arm = function () {
      steps.forEach(function (s, n) {
        s.setAttribute('data-state', 'pending');
        s.style.removeProperty('--dur');
        if (glyphs[n]) glyphs[n].textContent = '·';
      });
    };
    arm();

    var i = 0;
    var tick = function () {
      timer = 0;
      if (i > 0) {
        steps[i - 1].setAttribute('data-state', 'done');
        if (glyphs[i - 1]) glyphs[i - 1].textContent = '';
      }
      if (i === steps.length) {
        timer = setTimeout(restart, 4600);
        return;
      }
      var cur = steps[i];
      var ms = parseInt(cur.getAttribute('data-ms'), 10) || 800;
      cur.style.setProperty('--dur', ms + 'ms');
      cur.setAttribute('data-state', 'active');
      if (glyphs[i]) glyphs[i].textContent = '';
      i++;
      timer = setTimeout(tick, ms);
    };

    function restart() {
      /* calm can flip mid-flight, and the persistent observer plus the
         visibility listener both funnel back through here — without
         this guard a scroll or tab switch resurrects the run after
         the calm watcher has stopped it. */
      if (calm) { paintDone(); return; }
      timer = 0;
      i = 0;
      arm();
      if (clock) clock.textContent = runs[runIdx % runs.length] + ' ET';
      runIdx++;
      timer = setTimeout(tick, 520);
    }

    var anyHold = function () {
      for (var k in holds) { if (holds[k]) return true; }
      return false;
    };

    /* A resumed run restarts cleanly from step 0. Background tabs clamp
       setTimeout, so resuming mid-run would lurch through three steps at
       once; a fresh run is both honest and better looking. */
    var hold = function (key, on) {
      on = !!on;
      if (!!holds[key] === on) return;
      holds[key] = on;
      if (anyHold()) {
        clearTimeout(timer);
        timer = 0;
        stage.setAttribute('data-run', 'held');
      } else {
        /* Bookkeeping above always runs; the RESUME side effect never
           does under calm — the run stays painted done. */
        if (calm) return;
        stage.setAttribute('data-run', 'running');
        if (!timer) restart();
      }
    };

    document.addEventListener('visibilitychange', function () {
      hold('hidden', document.hidden);
    });
    /* The initial value, not just the transitions. A page opened in a
       background tab - new-tab click, restored session - never fires
       visibilitychange, so the run would otherwise start and lurch through
       steps under clamped timers before anyone saw it. */
    hold('hidden', document.hidden);

    var started = false;
    var begin = function () {
      if (started || calm) return;
      started = true;
      if (anyHold()) { stage.setAttribute('data-run', 'held'); return; }
      restart();
    };

    if ('IntersectionObserver' in window) {
      /* Persistent, not one-shot: off-screen is a real battery win on a
         phone, where the console sits below the fold for most of a visit. */
      new IntersectionObserver(function (entries) {
        var vis = entries[0].isIntersecting;
        if (vis) begin();
        if (started) hold('off', !vis);
      }, { threshold: 0.2 }).observe(stage);
      setTimeout(begin, 1150);   /* on the beat, after the hero settles */
    } else {
      setTimeout(begin, 1150);
    }

    /* WCAG 2.2.2 (Level A): motion that starts on its own, runs longer
       than five seconds and sits beside other content needs a mechanism
       to pause, stop or hide it. prefers-reduced-motion is a preference,
       not that mechanism - so the console gets a real control. It lives
       outside the aria-hidden subtree so it is reachable and announced.

       The "this listener never fires" report against this block was a
       STALE ASSET, not a defect. python -m http.server sends
       Last-Modified with no Cache-Control, so Chrome applied heuristic
       freshness and kept executing an app.js from before this block
       existed: getEntriesByType('resource') showed deliveryType 'cache'
       and transferSize 0, while a no-store fetch of the same URL
       returned 26 more lines. Verified working against a cache-busted
       copy - Hold freezes the run, Resume restarts it from step 0. Serve
       the preview with no-store (see serve.py) before believing anything
       measured about this file. */
    showHold(true);
    if (holdBtn) {
      holdBtn.addEventListener('click', function () {
        var on = holdBtn.getAttribute('aria-pressed') !== 'true';
        /* aria-pressed is the state; the NAME stays stable. Swapping both
           at once announces a contradiction - "Resume, pressed" - and the
           rest of this system carries state by form, not by swapped copy.
           Sighted users get it from .console-hold[aria-pressed='true']. */
        holdBtn.setAttribute('aria-pressed', String(on));
        hold('user', on);
      });
    }

    calmWatchers.push(function (isCalm) {
      if (!isCalm) return;
      clearTimeout(timer);
      timer = 0;
      holds.user = false;
      if (holdBtn) holdBtn.setAttribute('aria-pressed', 'false');
      paintDone();
      showHold(false);
    });
  });

  /* ── Next scheduled run ─────────────────────────────────────
     The verified cadence is 09:00 and 21:00 America/New_York. This
     shipped as a fixed 02:00/14:00 UTC, which is only the EST
     conversion - an hour wrong for the eight months the zone is on EDT,
     and wrong on screen the whole time the site has been live. The
     offset is now resolved from the zone itself on every render. Still
     derived locally: no backend implied, nothing fabricated. */

  var ET = 'America/New_York';
  var RUN_HOURS = [9, 21];

  var etHourOf = (function () {
    var fmt;
    try {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: ET, hour12: false, hour: '2-digit'
      });
    } catch (e) { fmt = null; }
    return function (d) {
      if (!fmt) return d.getUTCHours();          /* no ICU: degrade quietly */
      return parseInt(fmt.format(d), 10) % 24;
    };
  })();

  /* Step forward from the top of the hour and take the first instant whose
     ET wall clock is a run hour. Needs no offset table and is correct
     across both DST transitions. */
  var nextRunFrom = function (from) {
    var top = new Date(from.getTime());
    top.setUTCMinutes(0, 0, 0);
    for (var i = 0; i <= 26; i++) {
      var t = new Date(top.getTime() + i * 3600000);
      if (t > from && RUN_HOURS.indexOf(etHourOf(t)) !== -1) return t;
    }
    return null;
  };

  feature('nextrun', function () {
    var el = document.querySelector('[data-nextrun]');
    if (!el) return;

    var render = function () {
      var now = new Date();
      var next = nextRunFrom(now);
      if (!next) return;
      var mins = Math.max(0, Math.round((next - now) / 60000));
      var hh = etHourOf(next);
      el.textContent = (hh < 10 ? '0' + hh : hh) + ':00 ET · in ' +
        Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
    };

    render();
    setInterval(render, 60000);
  });

  /* ── Copy the address ───────────────────────────────────────── */

  feature('copy', function () {
    var btn = document.querySelector('[data-copy]');
    if (!btn || !navigator.clipboard) return;
    btn.hidden = false;

    var label = btn.querySelector('[data-copy-label]') || btn;
    var reset = 0;

    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(btn.getAttribute('data-copy')).then(function () {
        label.textContent = 'Copied';
        btn.setAttribute('data-copied', '');
        clearTimeout(reset);
        reset = setTimeout(function () {
          label.textContent = 'Copy';
          btn.removeAttribute('data-copied');
        }, 2200);
      }, function () {
        label.textContent = 'Press Ctrl+C';
      });
    });
  });

  /* ── The pointer bus ────────────────────────────────────────
     The ONE pointer listener set on the site. Rect reads happen on
     enter and on scroll/resize, never inside the move handler, so the
     steady state is zero forced layout reads per frame. Two extension
     points, and neither is "add a listener":
       - [data-lit] surfaces opt in by attribute (the --px/--py lattice,
         unchanged below);
       - the instrument-cursor features register hooks on `bus` —
         onMove / onLock / onMeasure — and registering one is what makes
         the bus bind on pages that have no [data-lit] at all.
     LOCKABLE is the single delegated check for "the pointer is on
     something interactive"; extend the selector, never the listeners. */

  var bus = null;

  feature('pointer-bus', function () {
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    var bound = false;
    var wanted = false;
    var active = null;
    var rect = null;
    var queued = false;
    var last = { x: 0, y: 0 };
    var lockEl = null;
    var moveWatchers = [];
    var lockWatchers = [];
    var measureWatchers = [];

    var LOCKABLE = 'a, button, [data-lit], summary';

    var write = function () {
      queued = false;
      if (!active || !rect) return;
      active.style.setProperty('--px', (last.x - rect.left) + 'px');
      active.style.setProperty('--py', (last.y - rect.top) + 'px');
    };

    var setLock = function (el) {
      if (el === lockEl) return;
      lockEl = el;
      lockWatchers.forEach(function (w) { try { w(el); } catch (err) {} });
    };

    var onOver = function (e) {
      if (e.pointerType === 'touch') return;
      /* Lock consumers read geometry HERE, on acquisition — which is
         the whole reason they are told now and not mid-move. */
      if (!calm) setLock(e.target.closest ? e.target.closest(LOCKABLE) : null);
      var el = e.target.closest ? e.target.closest('[data-lit]') : null;
      if (!el || el === active) return;
      active = el;
      rect = el.getBoundingClientRect();
      if (calm) {
        /* The CSS blanket cannot touch a JS-written custom property, so
           reduced motion is enforced here: light the centre once, then
           stop tracking. The affordance survives; the motion does not. */
        el.style.setProperty('--px', rect.width / 2 + 'px');
        el.style.setProperty('--py', rect.height / 2 + 'px');
        active = null;
      }
    };

    var onOut = function (e) {
      var to = e.relatedTarget;
      if (lockEl && !(to && lockEl.contains(to))) setLock(null);
      if (!active) return;
      if (to && active.contains(to)) return;
      active = null;
      rect = null;
    };

    var onMove = function (e) {
      /* Touch never drives the instrument: a drag is a scroll, not a
         pointer, and a ring chasing a scrolling thumb would be wrong
         on every hybrid device. */
      if (e.pointerType === 'touch') return;
      /* Always recorded — the follower and the compass need the
         position even when no lit surface is active. Watchers only
         flip flags and arm rAF loops; nothing here reads layout. */
      last.x = e.clientX;
      last.y = e.clientY;
      bus.seen = true;
      moveWatchers.forEach(function (w) { try { w(); } catch (err) {} });
      if (!active || calm) return;
      if (!queued) { queued = true; requestAnimationFrame(write); }
    };

    var remeasure = function () {
      if (active) rect = active.getBoundingClientRect();
      measureWatchers.forEach(function (w) { try { w(); } catch (err) {} });
    };

    var bind = function () {
      if (bound || !fine.matches) return;
      /* Bind for the lattice OR for a registered consumer. The compass
         mark is on every page, so in practice a consumer always
         exists; the query keeps a future stripped-down page honest. */
      if (!wanted && !document.querySelector('[data-lit]')) return;
      bound = true;
      document.addEventListener('pointerover', onOver, { passive: true });
      document.addEventListener('pointerout', onOut, { passive: true });
      document.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('scroll', remeasure, { passive: true });
      window.addEventListener('resize', remeasure, { passive: true });
    };

    bus = {
      fine: fine,
      last: last,
      seen: false,
      onMove: function (fn) { moveWatchers.push(fn); wanted = true; bind(); },
      onLock: function (fn) { lockWatchers.push(fn); wanted = true; bind(); },
      onMeasure: function (fn) { measureWatchers.push(fn); wanted = true; bind(); }
    };

    bind();
    if (fine.addEventListener) fine.addEventListener('change', bind);
    else if (fine.addListener) fine.addListener(bind);

    /* Lock is pointer state and reduced motion has no pointer play.
       The bus registered this watcher before any consumer registered
       theirs, so on a calm flip the release lands first and every
       consumer tears down from a released state. */
    calmWatchers.push(function (isCalm) { if (isCalm) setLock(null); });
  });

  /* ── The reticle ────────────────────────────────────────────
     A 26px ring that trails the native cursor — trails, never
     replaces: cursor:none would swap a 60fps OS pointer for a JS one
     and lose the plot on the first dropped frame. The lerp IS the
     easing (free drift is the human clock), so the outer box carries
     no transform transition at all; lock state lives on the inner
     ring in CSS, where acquisition runs on the machine clock. The rAF
     loop self-suspends: once the ring has settled onto the pointer it
     costs nothing until the next move re-arms it. */

  feature('reticle', function () {
    if (!bus) return;

    var ring = document.createElement('div');
    ring.className = 'cursor-ring';
    ring.setAttribute('aria-hidden', 'true');

    var x = 0, y = 0, raf = 0, on = false;

    var place = function () {
      ring.style.transform =
        'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
    };

    var step = function () {
      raf = 0;
      var dx = bus.last.x - x;
      var dy = bus.last.y - y;
      if (dx * dx + dy * dy < 0.09) {
        /* settled: snap exactly, paint once, let the loop die */
        x = bus.last.x;
        y = bus.last.y;
      } else {
        x += dx * 0.18;
        y += dy * 0.18;
        raf = requestAnimationFrame(step);
      }
      place();
    };

    /* Parked in the DOM at opacity 0 before it is ever shown, so the
       first .is-on actually transitions instead of popping. */
    var attach = function () {
      if (!ring.parentNode && bus.fine.matches) document.body.appendChild(ring);
    };
    if (!calm) attach();

    var show = function () {
      attach();
      on = true;
      x = bus.last.x;
      y = bus.last.y;
      place();
      ring.classList.add('is-on');
    };

    bus.onMove(function () {
      if (calm) return;
      if (!on) { show(); return; }
      if (!raf) raf = requestAnimationFrame(step);
    });

    bus.onLock(function (el) {
      ring.classList.toggle('is-locked', !!el);
    });

    calmWatchers.push(function (isCalm) {
      if (!isCalm) {
        /* back from calm: reappear where the pointer last was */
        if (bus.seen && bus.fine.matches) show();
        return;
      }
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      on = false;
      ring.classList.remove('is-on');
      ring.classList.remove('is-locked');
      if (ring.parentNode) ring.parentNode.removeChild(ring);
    });
  });

  /* ── The compass, and the pull ──────────────────────────────
     Two behaviours sharing one settle loop. While the reticle holds a
     .btn or the .mark, the element leans toward the pointer — at most
     5px, proportional to where the pointer sits inside it — riding the
     element's own eased transform transition, so the lean and the
     release are both human-clock and there is nothing to spring back.
     And the rose in the mark always turns its north spike toward the
     pointer: the site's compass finding the visitor. Hover the mark
     itself and it eases home to upright, so the logo is upright while
     it is actually being looked at. All geometry is cached on lock and
     on scroll/resize — never mid-move, the bus's core rule. */

  feature('compass', function () {
    if (!bus) return;

    var mark = document.querySelector('.mark');
    var rose = mark ? mark.querySelector('svg') : null;

    /* The rose's own centre, not the anchor's: the wordmark widens the
       anchor box and would skew the bearing at close range. Rotation
       about the centre keeps the centre invariant, so this stays true
       even when read from a mid-turn rect. */
    var mc = null;
    var measure = function () {
      if (!rose) return;
      var r = rose.getBoundingClientRect();
      mc = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    measure();

    var pulled = null;
    var base = null;
    var homing = false;
    var angle = 0;
    var raf = 0;
    var dirty = false;
    /* Scroll offsets are cached here and refreshed only from the bus's
       scroll/resize listeners and at lock time. pageXOffset is a
       layout-flush trigger in Blink, so reading it inside the frame
       loop would break the bus's zero-forced-reads promise. */
    var sx = window.pageXOffset;
    var sy = window.pageYOffset;
    var lastTx = 0;
    var lastTy = 0;

    var unpull = function () {
      if (!pulled) return;
      pulled.style.removeProperty('--pull-x');
      pulled.style.removeProperty('--pull-y');
      lastTx = 0;
      lastTy = 0;
    };

    var step = function () {
      raf = 0;
      if (calm) return;
      var busy = dirty;
      dirty = false;

      if (pulled && base) {
        /* the centre cached at lock, corrected for CACHED scroll since —
           no layout read of any kind in here */
        var cx = base.x - (sx - base.sx);
        var cy = base.y - (sy - base.sy);
        var tx = Math.max(-5, Math.min(5, (bus.last.x - cx) * base.kx));
        var ty = Math.max(-5, Math.min(5, (bus.last.y - cy) * base.ky));
        lastTx = tx;
        lastTy = ty;
        /* Custom properties, not transform: the element's own CSS
           composes the pull with its :hover lift and :active press, so
           the magnet can never eat the press feedback. */
        pulled.style.setProperty('--pull-x', tx.toFixed(2) + 'px');
        pulled.style.setProperty('--pull-y', ty.toFixed(2) + 'px');
      }

      if (rose && mc) {
        var target = 0;
        if (!homing && bus.seen) {
          target = Math.atan2(bus.last.y - mc.y, bus.last.x - mc.x)
            * 180 / Math.PI + 90;
        }
        /* shortest arc: fold the error into (-180, 180] so the rose
           never takes the long way round */
        var d = ((target - angle) % 360 + 540) % 360 - 180;
        if (Math.abs(d) < 0.05) {
          angle = target;
        } else {
          angle += d * 0.16;
          busy = true;
        }
        angle = ((angle % 360) + 540) % 360 - 180;
        rose.style.transform = 'rotate(' + angle.toFixed(2) + 'deg)';
      }

      if (busy) raf = requestAnimationFrame(step);
    };

    var wake = function () { if (!raf) raf = requestAnimationFrame(step); };

    bus.onLock(function (el) {
      var t = el && el.classList &&
        (el.classList.contains('btn') || el.classList.contains('mark'))
        ? el : null;
      if (pulled && pulled !== t) unpull();
      pulled = t;
      base = null;
      if (t) {
        /* read on lock, not on move — the bus's core rule. kx/ky map
           "pointer at the element's edge" to the full 5px lean. */
        var r = t.getBoundingClientRect();
        sx = window.pageXOffset;
        sy = window.pageYOffset;
        base = {
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          kx: 10 / Math.max(1, r.width),
          ky: 10 / Math.max(1, r.height),
          sx: sx,
          sy: sy
        };
      }
      homing = !!(el && el === mark);
      dirty = true;
      wake();
    });

    bus.onMove(function () {
      if (calm) return;
      dirty = true;
      wake();
    });

    /* Fires from the bus's scroll/resize listeners — the sanctioned
       place for geometry. Not gated on calm: a stale rose centre or
       base would otherwise greet the visitor the moment the motion
       preference relaxes. The rects read here include our own applied
       pull, so the base is rebuilt minus the last written offset. */
    bus.onMeasure(function () {
      measure();
      sx = window.pageXOffset;
      sy = window.pageYOffset;
      if (pulled && base) {
        var r = pulled.getBoundingClientRect();
        base.x = r.left + r.width / 2 - lastTx;
        base.y = r.top + r.height / 2 - lastTy;
        base.sx = sx;
        base.sy = sy;
      }
      if (calm) return;
      dirty = true;
      wake();
    });

    calmWatchers.push(function (isCalm) {
      if (!isCalm) return;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      unpull();
      pulled = null;
      base = null;
      homing = false;
      angle = 0;
      if (rose) rose.style.removeProperty('transform');
    });
  });

  /* ── Machine text: the decode pass ──────────────────────────
     Labels and the wordmark are telemetry, so they arrive the way a
     terminal prints: discrete glyph swaps on a fixed clock, resolving
     left-to-right. Deterministic, never random — the same reason the
     console never jitters: randomness reads as flakiness, and two
     visits should decode identically. The pool is ASCII only; the
     shipped subsets have lost non-ASCII glyphs before (U+2192,
     U+2713), and a tofu box mid-decode is worse than no decode. */

  var decodePass = (function () {
    var POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/<>=';
    var WORD = /[A-Za-z0-9]/;
    /* 45ms per swap: fast enough to read as telemetry, slow enough
       that every state is a visible, equal step. A machine clock —
       linear ticks, so there is nothing here to ease. */
    var TICK = 45;

    return function (el, text, dur, done) {
      var len = text.length;
      var t0 = 0;
      var lastStep = -1;

      var paint = function (step, resolved) {
        var out = '';
        for (var i = 0; i < len; i++) {
          var c = text.charAt(i);
          /* Spaces and punctuation never scramble: word shape — and
             therefore wrapping — must hold while the letters churn. */
          out += (i < resolved || !WORD.test(c))
            ? c
            /* POOL is 41 long, a prime, so this walk visits the whole
               pool and neighbouring characters never move in step. */
            : POOL.charAt((i * 11 + step * 7) % 41);
        }
        el.textContent = out;
      };

      var frame = function (now) {
        if (!t0) t0 = now;
        var gone = now - t0;
        /* calm is read LIVE: if the preference flips mid-pass the
           text simply is, on the next frame. */
        if (calm || gone >= dur) {
          el.textContent = text;
          if (done) done();
          return;
        }
        var step = Math.floor(gone / TICK);
        if (step !== lastStep) {
          lastStep = step;
          paint(step, Math.floor(len * gone / dur));
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    };
  })();

  /* ── Kickers decode in ──────────────────────────────────────
     Every kicker resolves from glyphs as it enters the viewport, over
     450ms (ten equal ticks). A separate observer from 'reveal',
     deliberately: reveal watches .reveal containers, and two kickers
     on the work page live outside any of them. Margins match
     reveal's, so both arrivals land on the same beat. Once per
     element, ever — unobserve is the memory. Kickers are --mono, so
     the churn cannot move a single pixel of layout. */

  feature('kickers', function () {
    var kickers = document.querySelectorAll('.kicker');
    if (!kickers.length || calm || !('IntersectionObserver' in window)) return;

    var seer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        seer.unobserve(el);
        if (calm) return;   /* flipped since load: the text simply is */
        var text = el.textContent;
        /* The DOM holds glyph churn for 450ms; assistive tech must
           never see it. aria-label would be the obvious shield, but
           naming is PROHIBITED on a paragraph — AT ignores it and
           reads the churn anyway. So the churn goes into a hidden
           child while a visually-hidden twin carries the real text;
           when the pass ends the paragraph is plain text again, as if
           nothing happened. No live region — nothing is announced. */
        var sr = document.createElement('span');
        sr.className = 'sr-only';
        sr.textContent = text;
        var churn = document.createElement('span');
        churn.setAttribute('aria-hidden', 'true');
        churn.textContent = text;
        el.textContent = '';
        el.appendChild(sr);
        el.appendChild(churn);
        decodePass(churn, text, 450, function () {
          el.textContent = text;
        });
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.1 });
    each(kickers, function (el) { seer.observe(el); });
  });

  /* ── Wordmark hover decode ──────────────────────────────
     One fast pass over NOCTIX when the reticle locks the mark. The
     lock only fires on change, so entering the mark runs one pass,
     wandering between its children runs none, and leaving re-arms it
     by the same rule. No listeners of its own: rule 3. */

  feature('wordmark', function () {
    if (!bus) return;
    var mark = document.querySelector('.mark');
    var word = mark ? mark.querySelector('.wordmark') : null;
    if (!word) return;

    var full = word.textContent;
    var running = false;

    bus.onLock(function (el) {
      if (el !== mark || running || calm) return;
      /* The span hides under 640px but a narrowed desktop window still
         has a fine pointer: offsetWidth 0 means not rendered, so there
         is nothing to decode and nothing worth pinning at 0px. */
      var w = word.offsetWidth;
      if (!w) return;
      running = true;
      /* Inter is proportional and churned capitals can be WIDER than
         NOCTIX (W for C, D for I), so width — not min-width — pins the
         span for real. Measured on lock, the same budget as the bus's
         own rect read, never mid-move. Cleared when the pass ends. */
      word.style.width = w + 'px';
      /* The accessible name shield goes on the LINK: naming is valid
         on <a> and prohibited on a bare <span>, where AT ignores it
         and reads the churn. */
      mark.setAttribute('aria-label', full);
      decodePass(word, full, 300, function () {
        running = false;
        word.style.removeProperty('width');
        mark.removeAttribute('aria-label');
      });
    });
  });

  /* ── The entrance ───────────────────────────────────────────
     A brand stinger on the first page view of a session — and only
     then. The veil is built HERE, never in markup, so a visitor
     without JS can never be behind it (rule 1). Once anything is
     built or held it is on a hard deadline: an unconditional timer
     tears everything down at 1800ms even if every other line of this
     feature has already thrown.

     The hero choreography waits behind the veil — animation-play-state
     paused via a class on <html>, applied only from here — and is
     released the moment the lift begins, so the statement lines rise
     as the veil clears them instead of playing to nobody. */

  feature('entrance', function () {
    var root = document.documentElement;

    if (calm) return;
    if (root.classList.contains('vt-nav')) return;

    /* A page opened in a background tab (ctrl+click, session restore)
       would play the whole stinger to nobody and burn the session
       token doing it. Bail BEFORE the token is consumed, so the first
       page actually seen still gets the moment. */
    if (document.hidden) return;

    /* Once per session. If storage is unavailable (Safari private
       mode throws) we cannot remember having played, so we never
       play: a stinger on every single navigation is worse than none. */
    try {
      if (sessionStorage.getItem('nx-entrance')) return;
      sessionStorage.setItem('nx-entrance', '1');
    } catch (e) { return; }

    /* Long pages can paint before a deferred script runs. If the
       visitor has already seen content, the moment has passed —
       covering the page back up would be theatre at their expense. */
    try {
      if (performance.getEntriesByType &&
          performance.getEntriesByType('paint').length) return;
    } catch (e) {}

    var srcMark = document.querySelector('.mark svg');
    if (!srcMark) return;

    /* Failsafe FIRST, before anything is built or held: a throw
       below still gets cleaned up by this timer (and feature()'s
       catch keeps the rest of the file alive). It is never cleared —
       once the veil is gone both calls are no-ops. */
    var veil = document.createElement('div');
    var unhold = function () { root.classList.remove('nx-hold'); };
    var remove = function () {
      if (veil.parentNode) veil.parentNode.removeChild(veil);
    };
    setTimeout(function () { unhold(); remove(); }, 1800);

    root.classList.add('nx-hold');

    veil.className = 'nx-veil';
    veil.setAttribute('aria-hidden', 'true');

    var core = document.createElement('div');
    core.className = 'nx-veil-core';

    var mark = srcMark.cloneNode(true);
    mark.setAttribute('width', '40');
    mark.setAttribute('height', '40');
    core.appendChild(mark);

    var rule = document.createElement('div');
    rule.className = 'nx-veil-rule';
    core.appendChild(rule);

    var word = document.createElement('div');
    word.className = 'nx-veil-word';
    var letters = 'NOCTIX';
    for (var c = 0; c < letters.length; c++) {
      var s = document.createElement('span');
      s.textContent = letters.charAt(c);
      s.style.setProperty('--k', String(c));
      word.appendChild(s);
    }
    core.appendChild(word);

    veil.appendChild(core);
    document.body.appendChild(veil);

    var gone = false;
    var liftTimer = 0;

    /* Idempotent release: lets the hero play and detaches the skip
       listeners. HOW the veil leaves — lift, fade, hard remove — is
       the caller's business. Returns whether this call did the work. */
    var settle = function () {
      if (gone) return false;
      gone = true;
      clearTimeout(liftTimer);
      document.removeEventListener('keydown', skip, true);
      document.removeEventListener('pointerdown', skip, true);
      unhold();
      return true;
    };

    /* pointerdown is a discrete press — the same class of input as
       click, not part of the bus's over/out/move contract — and both
       listeners live exactly as long as the veil does. Capture phase,
       so nothing underneath can swallow the escape hatch. */
    var skip = function () {
      if (!settle()) return;
      veil.classList.add('is-skip');
      setTimeout(remove, 260);           /* --t-tap plus a frame of grace */
    };
    document.addEventListener('keydown', skip, true);
    document.addEventListener('pointerdown', skip, true);

    /* The scheduled lift. 880ms of stinger + --t-settle of lift lands
       on the 1400ms ceiling exactly; the veil swallows the press that
       skips it, so a tap during the stinger can never activate a link
       it is covering. */
    liftTimer = setTimeout(function () {
      if (!settle()) return;
      veil.classList.add('is-lift');
      setTimeout(remove, 620);           /* --t-settle plus grace */
    }, 880);

    /* Preference can flip mid-play: the veil is motion, so it goes,
       immediately and without ceremony. */
    calmWatchers.push(function (isCalm) {
      if (!isCalm) return;
      settle();
      remove();
    });
  });

  /* ── The hidden layer ───────────────────────────────────────
     Rewards for the curious. Nothing below announces itself, nothing
     below is required for the page to work, and nothing below shows a
     value that is not computed or already true elsewhere on the site. */

  feature('signature', function () {
    /* Some locked-down consoles swap `console` for a proxy that throws
       on use; feature() would catch that, but check the shape anyway so
       a partial console object cannot half-print. The plate carries its
       own background because devtools themes vary: silver on the site's
       night reads the same in a light console as in a dark one. Lines
       are padded to one width so the plate stays a rectangle. */
    if (!window.console || typeof console.log !== 'function') return;

    var W = 46;
    var padTo = function (s) { while (s.length < W) s += ' '; return s; };
    var ink = function (c) {
      return 'background:#08090b;font-family:Consolas,monospace;line-height:1.5;color:' + c;
    };

    var l1  = padTo('   N');
    var l2a = ' W-+-E   ';
    var l2b = padTo(l2a + 'NOCTIX — software that runs itself.').slice(l2a.length);
    var l3a = '   S     ';
    var l3b = padTo(l3a + 'curious? lucas@noctix.dev').slice(l3a.length);

    console.log(
      '%c' + l1 + '\n' + l2a + '%c' + l2b + '%c\n' + l3a + '%c' + l3b,
      ink('#d6dbe4'), ink('#f4f5f7'), ink('#d6dbe4'), ink('#8b929e')
    );
  });

  /* ── First light ────────────────────────────────────────────
     Typing "dawn" anywhere plays the sky's scroll crossfade as one
     nine-second pass on the document timeline — the same two painted
     scenes, the same opacity-only crossfade, just driven by time
     instead of travel. The class does all the CSS work; this feature
     only decides when it goes on and guarantees it comes off. */

  feature('first-light', function () {
    var sky = document.querySelector('.sky');
    if (!sky) return;

    var buf = '';
    var running = false;
    var was = null;      /* the exact title, cached for exact restore */
    var failsafe = 0;

    var end = function () {
      if (!running) return;
      running = false;
      clearTimeout(failsafe);
      failsafe = 0;
      document.documentElement.classList.remove('first-light');
      if (was !== null) { document.title = was; was = null; }
    };

    /* animationend is the normal exit; the failsafe exists because the
       title MUST come back even if that event never arrives (an
       extension nulling animations, the element display-toggled
       mid-run). Ten seconds covers the nine-second pass with room. */
    sky.addEventListener('animationend', function (e) {
      if (e.animationName === 'first-light-pass') end();
    });

    /* Mid-run preference flip: the CSS !important blanket has already
       forced the sky dark; this puts the title and the class back. */
    calmWatchers.push(function (isCalm) { if (isCalm) end(); });

    document.addEventListener('keydown', function (e) {
      if (calm || running) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) { buf = ''; return; }
      /* Only printing keys feed the buffer. Shift mid-word must not
         reset it, so non-printing keys are ignored rather than treated
         as a break — the four-character window is its own gate. */
      if (!e.key || e.key.length !== 1) return;
      buf = (buf + e.key.toLowerCase()).slice(-4);
      if (buf !== 'dawn') return;
      buf = '';
      running = true;
      was = document.title;
      document.title = was + ' — first light';
      document.documentElement.classList.add('first-light');
      failsafe = setTimeout(end, 10000);
    });
  });

  /* ── Beacon readout ─────────────────────────────────────────
     The footer status stops being a claim and starts being a control:
     press it and it shows its evidence. Everything in the popover is
     computed from machinery that already exists — etHourOf,
     nextRunFrom — or restates figures already published on the site.
     Nothing new is claimed. */

  feature('beacon-readout', function () {
    var mark = document.querySelector('.foot .status');
    if (!mark || mark.tagName === 'BUTTON') return;

    /* The span becomes a button with the identical skin: it keeps the
       class, so .foot .status keeps styling it; button.status in the
       stylesheet only strips the UA chrome a <button> brings. */
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = mark.className;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'beacon-readout');
    while (mark.firstChild) btn.appendChild(mark.firstChild);
    var dot = btn.querySelector('.beacon');
    if (dot) dot.setAttribute('aria-hidden', 'true');

    var wrap = document.createElement('span');
    wrap.className = 'status-wrap';
    mark.parentNode.replaceChild(wrap, mark);
    wrap.appendChild(btn);

    var pop = document.createElement('div');
    pop.className = 'status-pop';
    pop.id = 'beacon-readout';
    pop.setAttribute('role', 'status');
    pop.hidden = true;
    wrap.appendChild(pop);

    var row = function (key) {
      var r = document.createElement('div');
      r.className = 'status-row';
      var k = document.createElement('span');
      k.className = 'status-key';
      k.textContent = key;
      var v = document.createElement('span');
      v.className = 'status-val';
      r.appendChild(k);
      r.appendChild(v);
      pop.appendChild(r);
      return v;
    };
    /* etHourOf degrades to UTC without ICU — fine for a vague "next
       run" hint, a lie under an explicit "time, ET" label. The time
       rows exist only when the zone lookup actually works; the
       verified row is arithmetic and always true. */
    var hasTZ = false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: ET });
      hasTZ = true;
    } catch (e) {}

    var vNow = hasTZ ? row('time, ET') : null;
    var vNext = hasTZ ? row('next run') : null;
    var vProof = row('verified');

    var pad = function (n) { return (n < 10 ? '0' : '') + n; };

    /* ET is a whole-hour zone in both halves of the year, so the ET
       minute IS the UTC minute; only the hour needs the zone lookup
       that etHourOf already does. */
    var render = function () {
      var now = new Date();
      if (vNow) vNow.textContent = pad(etHourOf(now)) + ':' + pad(now.getUTCMinutes());
      var next = hasTZ ? nextRunFrom(now) : null;
      if (vNext && next) {
        var mins = Math.max(0, Math.round((next - now) / 60000));
        vNext.textContent = pad(etHourOf(next)) + ':00 · in ' +
          Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
      }
      vProof.textContent = '16/16 steps · 105 tests · 470/470 verified';
    };

    /* The document listener exists only while the popover is open —
       closed, this feature costs the page nothing per click. The
       opening click also bubbles here, so `away` must ignore anything
       inside the wrapper rather than rely on timing. */
    var away = function (e) {
      if (wrap.contains(e.target)) return;
      shut();
    };
    var openUp = function () {
      pop.hidden = false;
      render();   /* after unhiding, so role=status announces the values;
                     computed per open, never on a timer — a live region
                     that re-announces every minute is spam, not status */
      btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', away);
    };
    function shut() {
      pop.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', away);
    }

    btn.addEventListener('click', function () {
      if (pop.hidden) openUp(); else shut();
    });
    /* Focus never leaves the button, so Esc is caught on the wrapper. */
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !pop.hidden) shut();
    });
    /* Tabbing away must not strand an open popover with aria-expanded
       stuck true: keyboard users get the same close the mouse gets
       from the click-away listener. */
    wrap.addEventListener('focusout', function (e) {
      if (pop.hidden) return;
      if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
      shut();
    });
  });

  /* ── Footer year ────────────────────────────────────────────── */

  feature('year', function () {
    var year = document.querySelector('[data-year]');
    if (year) year.textContent = new Date().getFullYear();
  });
})();
