/* NOCTIX — small, dependency-free behaviour.
   Everything here is decoration: the site reads and works fine with JS off,
   and every animation is skipped when the visitor asks for reduced motion. */

(function () {
  'use strict';

  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Header hairline appears once you leave the top ───────── */

  var head = document.querySelector('.masthead');
  if (head) {
    var onScroll = function () {
      head.classList.toggle('is-stuck', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── Reveal on scroll ─────────────────────────────────────── */

  var hidden = document.querySelectorAll('.reveal');
  var showAll = function () {
    Array.prototype.forEach.call(hidden, function (el) { el.classList.add('is-in'); });
  };

  if (!hidden.length) {
    /* nothing to do */
  } else if (calm || !('IntersectionObserver' in window)) {
    showAll();
  } else {
    var seer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = parseInt(el.getAttribute('data-delay') || '0', 10);
        setTimeout(function () { el.classList.add('is-in'); }, delay);
        seer.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.1 });
    Array.prototype.forEach.call(hidden, function (el) { seer.observe(el); });

    /* Safety net: some environments never report intersection. Content
       must not be permanently invisible because an animation didn't run. */
    setTimeout(showAll, 3000);
  }

  /* ── Count-up for numeric stats ───────────────────────────
     Only touches elements carrying data-count, so text stats
     ("Six figures") are left exactly as authored. */

  var counters = document.querySelectorAll('[data-count]');
  if (counters.length && !calm && 'IntersectionObserver' in window) {
    var counterSeer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        counterSeer.unobserve(el);

        var target = parseFloat(el.getAttribute('data-count'));
        var suffix = el.getAttribute('data-suffix') || '';
        var start = performance.now();
        var dur = 1100;

        var tick = function (now) {
          var t = Math.min((now - start) / dur, 1);
          var eased = 1 - Math.pow(1 - t, 3);           // ease-out cubic
          el.textContent = Math.round(target * eased) + suffix;
          if (t < 1) requestAnimationFrame(tick);
        };
        el.textContent = '0' + suffix;
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { counterSeer.observe(el); });
  }

  /* ── The console: a billing cycle that runs itself ────────
     Walks each step pending -> active -> done, holds on the
     finished state, then quietly starts the next run. This is
     the argument the site is making, so it never stops. */

  var stage = document.querySelector('[data-console]');
  if (stage) {
    var steps = Array.prototype.slice.call(stage.querySelectorAll('.step'));
    var clock = stage.querySelector('[data-clock]');
    var runs = ['02:00', '14:00'];
    var runIdx = 0;

    var paint = function (state) {
      steps.forEach(function (s) { s.setAttribute('data-state', state); });
    };

    if (calm) {
      /* Reduced motion: show the completed run, no looping. */
      paint('done');
      steps.forEach(function (s) { s.querySelector('.glyph').textContent = '✓'; });
    } else {
      var cycle = function () {
        paint('pending');
        steps.forEach(function (s) { s.querySelector('.glyph').textContent = '·'; });
        if (clock) clock.textContent = runs[runIdx % runs.length] + ' UTC';
        runIdx++;

        var i = 0;
        var advance = function () {
          if (i > 0) {
            var prev = steps[i - 1];
            prev.setAttribute('data-state', 'done');
            prev.querySelector('.glyph').textContent = '✓';
          }
          if (i === steps.length) {
            setTimeout(cycle, 4200);              // hold the finished run
            return;
          }
          var cur = steps[i];
          cur.setAttribute('data-state', 'active');
          cur.querySelector('.glyph').textContent = '◐';
          i++;
          setTimeout(advance, 700 + Math.round(Math.random() * 350));
        };
        setTimeout(advance, 500);
      };

      /* Prefer starting when it's actually on screen, but never let a
         missing intersection callback leave the console frozen. */
      var started = false;
      var begin = function () {
        if (started) return;
        started = true;
        cycle();
      };

      if ('IntersectionObserver' in window) {
        var once = new IntersectionObserver(function (entries) {
          if (entries[0].isIntersecting) { once.disconnect(); begin(); }
        }, { threshold: 0.25 });
        once.observe(stage);
        setTimeout(begin, 2000);
      } else {
        begin();
      }
    }
  }

  /* ── Footer year ──────────────────────────────────────────── */

  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
})();
