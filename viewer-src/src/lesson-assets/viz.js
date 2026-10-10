/* Shared helpers for interactive lessons (see assets/viz.css).
 * Viz.steps(): a step navigator for <section class="step-panel" data-step="…"
 *   data-title="…" [data-optional]> blocks. Every step stays on one long page; the
 *   navigator (a sidebar when there is room, a sticky top bar otherwise) highlights
 *   the step being read and scrolls to a step when clicked. Steps already read are
 *   ticked and remembered per page in localStorage (a convenience only).
 *   Without JavaScript the page reads top to bottom with no navigator.
 * Viz.seg(el, onChange): wires a .seg toggle; returns nothing.
 * Viz.reduced: true when the reader asked for reduced motion (skip animation,
 *   show the final state). */
(function () {
  "use strict";
  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function steps() {
    var panels = Array.prototype.slice.call(
      document.querySelectorAll(".step-panel"),
    );
    if (!panels.length) return;
    var root = document.documentElement;
    root.classList.add("js-steps");
    var hash = location.hash.slice(1); // read before the scroll spy rewrites it
    var key = "viz-visited:" + location.pathname;
    var visited = {};
    try {
      visited = JSON.parse(localStorage.getItem(key) || "{}") || {};
    } catch (e) {
      visited = {};
    }

    function make(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }
    var nav = make("nav", "stepnav");
    nav.setAttribute("aria-label", "Lesson steps");
    var bar = make("div", "stepnav-bar");
    var prevBtn = make("button", "stepnav-arrow", "←");
    prevBtn.setAttribute("aria-label", "Previous step");
    var cur = make("button", "stepnav-current");
    cur.setAttribute("aria-expanded", "false");
    var nextBtn = make("button", "stepnav-arrow", "→");
    nextBtn.setAttribute("aria-label", "Next step");
    [prevBtn, cur, nextBtn].forEach(function (b) {
      b.type = "button";
      bar.appendChild(b);
    });
    var head = make(
      "p",
      "stepnav-head",
      "This lesson · " + panels.length + " steps",
    );
    var list = make("ol", "stepnav-list");
    var progress = make("div", "stepnav-progress");
    var fill = make("span");
    progress.appendChild(fill);
    nav.appendChild(bar);
    nav.appendChild(head);
    nav.appendChild(list);
    nav.appendChild(progress);

    var items = panels.map(function (p, i) {
      var li = make("li");
      var b = make("button");
      b.type = "button";
      b.appendChild(make("span", "num", String(i + 1)));
      var label = make("span", null, p.getAttribute("data-title"));
      if (p.hasAttribute("data-optional"))
        label.appendChild(make("span", "opt", " (optional)"));
      b.appendChild(label);
      b.addEventListener("click", function () {
        go(i);
        close();
      });
      li.appendChild(b);
      list.appendChild(li);
      return { li: li, b: b };
    });
    panels[0].parentNode.insertBefore(nav, panels[0]);

    // The top bar covers the top of the page on phones, so scroll targets sit below it.
    function offset() {
      return nav.classList.contains("side") ? 16 : nav.offsetHeight + 12;
    }

    var current = -1;
    function mark(i) {
      if (i === current) return;
      current = i;
      visited[i] = true;
      try {
        localStorage.setItem(key, JSON.stringify(visited));
      } catch (e) {
        /* private mode */
      }
      items.forEach(function (it, j) {
        if (j === i) it.b.setAttribute("aria-current", "step");
        else it.b.removeAttribute("aria-current");
        it.li.classList.toggle("done", !!visited[j] && j !== i);
      });
      cur.innerHTML = "";
      cur.appendChild(
        make("span", "count", "Step " + (i + 1) + " of " + panels.length),
      );
      cur.appendChild(
        document.createTextNode(panels[i].getAttribute("data-title")),
      );
      cur.appendChild(make("span", "caret", "▾"));
      prevBtn.disabled = i === 0;
      nextBtn.disabled = i === panels.length - 1;
      fill.style.width = ((i + 1) / panels.length) * 100 + "%";
      try {
        history.replaceState(
          null,
          "",
          "#" + panels[i].getAttribute("data-step"),
        );
      } catch (e) {
        /* file:// */
      }
      document.dispatchEvent(
        new CustomEvent("viz:step", {
          detail: panels[i].getAttribute("data-step"),
        }),
      );
    }

    // Scroll spy: the current step is the last one whose top has passed a line
    // a third of the way down the viewport. At the very bottom, it's the last step.
    var lock = 0; // while a click-scroll runs, keep the clicked step highlighted
    function spy() {
      if (Date.now() < lock) return;
      var line = Math.min(window.innerHeight / 3, 260);
      var i = 0;
      panels.forEach(function (p, j) {
        if (p.getBoundingClientRect().top - offset() <= line) i = j;
      });
      if (
        window.innerHeight + window.pageYOffset >=
        document.documentElement.scrollHeight - 4
      )
        i = panels.length - 1;
      mark(i);
    }
    var ticking = false;
    window.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          spy();
        });
      },
      { passive: true },
    );

    function go(i) {
      var top =
        panels[i].getBoundingClientRect().top + window.pageYOffset - offset();
      lock = Date.now() + (reduced ? 0 : 900);
      mark(i);
      window.scrollTo({
        top: Math.max(0, top),
        behavior: reduced ? "auto" : "smooth",
      });
    }
    prevBtn.addEventListener("click", function () {
      if (current > 0) go(current - 1);
    });
    nextBtn.addEventListener("click", function () {
      if (current < panels.length - 1) go(current + 1);
    });
    function close() {
      nav.classList.remove("open");
      cur.setAttribute("aria-expanded", "false");
    }
    cur.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      cur.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", function (e) {
      if (!nav.contains(e.target)) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    // Sidebar when the space left of the reading column fits it; top bar otherwise.
    var column = nav.parentNode;
    function layout() {
      var rem = parseFloat(getComputedStyle(root).fontSize) || 16;
      var free = column.getBoundingClientRect().left;
      var side = free >= 13.5 * rem;
      nav.classList.toggle("side", side);
      root.classList.toggle("has-stepnav-side", side);
      spy();
    }
    layout();
    window.addEventListener("resize", layout);

    var start = -1;
    panels.forEach(function (p, i) {
      if (p.getAttribute("data-step") === hash) start = i;
    });
    if (start > 0) {
      lock = 0;
      var t =
        panels[start].getBoundingClientRect().top +
        window.pageYOffset -
        offset();
      window.scrollTo(0, Math.max(0, t));
      mark(start);
    } else {
      spy();
    }
  }

  function seg(el, onChange) {
    var buttons = Array.prototype.slice.call(el.querySelectorAll("button"));
    buttons.forEach(function (b) {
      b.type = "button";
      b.addEventListener("click", function () {
        buttons.forEach(function (o) {
          o.setAttribute("aria-pressed", String(o === b));
        });
        onChange(b.getAttribute("data-v"));
      });
    });
  }

  /* Spot-it exercises: the answer stays blurred (and hidden from assistive tech) until revealed. */
  function spots() {
    Array.prototype.slice
      .call(document.querySelectorAll(".spot"))
      .forEach(function (box) {
        var btn = box.querySelector(".spot-toggle");
        var ans = box.querySelector(".spot-answer");
        if (!btn || !ans) return;
        btn.type = "button";
        function set(open) {
          box.classList.toggle("revealed", open);
          btn.setAttribute("aria-expanded", String(open));
          btn.textContent = open ? "Hide answer" : "Show answer";
          if (open) ans.removeAttribute("inert");
          else ans.setAttribute("inert", "");
          ans.setAttribute("aria-hidden", String(!open));
        }
        set(false);
        btn.addEventListener("click", function () {
          set(!box.classList.contains("revealed"));
        });
      });
  }

  window.Viz = { steps: steps, seg: seg, reduced: reduced, spots: spots };
  document.addEventListener("DOMContentLoaded", steps);
  document.addEventListener("DOMContentLoaded", spots);
})();
