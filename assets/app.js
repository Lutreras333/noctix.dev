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

  /* ── Count-up stats ─────────────────────────────────────────── */

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
          el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))) + suffix;
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
      if (started) return;
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
     The ONE pointer listener on the site. Rect is read on enter and on
     scroll/resize, never inside the move handler, so the steady state
     is zero forced layout reads and two custom-property writes on a
     single element per frame. data-lit is the documented extension
     point: new surfaces opt in by attribute, not by new listeners. */

  feature('pointer-bus', function () {
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    var bound = false;
    var active = null;
    var rect = null;
    var queued = false;
    var last = { x: 0, y: 0 };

    var write = function () {
      queued = false;
      if (!active || !rect) return;
      active.style.setProperty('--px', (last.x - rect.left) + 'px');
      active.style.setProperty('--py', (last.y - rect.top) + 'px');
    };

    var onOver = function (e) {
      var el = e.target.closest ? e.target.closest('[data-lit]') : null;
      if (!el || el === active) return;
      if (e.pointerType === 'touch') return;
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
      if (!active) return;
      if (e.relatedTarget && active.contains(e.relatedTarget)) return;
      active = null;
      rect = null;
    };

    var onMove = function (e) {
      if (!active || calm) return;
      last.x = e.clientX;
      last.y = e.clientY;
      if (!queued) { queued = true; requestAnimationFrame(write); }
    };

    var remeasure = function () { if (active) rect = active.getBoundingClientRect(); };

    var bind = function () {
      if (bound || !fine.matches) return;
      if (!document.querySelector('[data-lit]')) return;
      bound = true;
      document.addEventListener('pointerover', onOver, { passive: true });
      document.addEventListener('pointerout', onOut, { passive: true });
      document.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('scroll', remeasure, { passive: true });
      window.addEventListener('resize', remeasure, { passive: true });
    };

    bind();
    if (fine.addEventListener) fine.addEventListener('change', bind);
    else if (fine.addListener) fine.addListener(bind);
  });

  /* ── Footer year ────────────────────────────────────────────── */

  feature('year', function () {
    var year = document.querySelector('[data-year]');
    if (year) year.textContent = new Date().getFullYear();
  });
})();
