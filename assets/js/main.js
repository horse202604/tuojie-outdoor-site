/* ==========================================================================
   TORLIRO — site behaviour
   1. Mobile navigation        2. Active nav state
   3. Scroll reveal            4. Video play control
   5. Inquiry form validation + submission stub
   ========================================================================== */

(function () {
  "use strict";

  document.documentElement.classList.add("js");

  /* ------------------------------------------------------------- 1. Nav */
  var toggle = document.getElementById("navToggle");
  var nav = document.getElementById("primaryNav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  /* --------------------------------------------------- 2. Active nav item */
  var path = window.location.pathname;
  var here = path.split("/").pop() || "index.html";
  var inProducts = /\/products\//.test(path.replace(/\\/g, "/"));

  nav &&
    Array.prototype.forEach.call(nav.querySelectorAll("a"), function (link) {
      var href = link.getAttribute("href") || "";
      var target = href.split("/").pop();
      var isProducts = target === "products.html";
      if ((inProducts && isProducts) || (!inProducts && target === here)) {
        link.setAttribute("aria-current", "page");
      }
    });

  /* ------------------------------------------------------ 3. Scroll reveal */
  var revealables = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && revealables.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
    );
    revealables.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealables.forEach(function (el) {
      el.classList.add("is-in");
    });
  }

  /* -------------------------------------------- 4. Factory ambient video */
  var ambientVideos = document.querySelectorAll("[data-ambient-video]");

  if (ambientVideos.length) {
    var ambientReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var ambientConn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
    var ambientThrifty =
      ambientConn.saveData === true || /(^|\b)(slow-2g|2g|3g)\b/.test(ambientConn.effectiveType || "");

    /* reduced motion, Save-Data or a slow connection: the poster frame stays */
    if (!ambientReduced && !ambientThrifty && "IntersectionObserver" in window) {
      var ambientIO = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            var video = entry.target.querySelector("video");
            if (!video) return;
            if (entry.isIntersecting) {
              if (!video.getAttribute("src")) video.src = video.dataset.src;
              var started = video.play();
              if (started && started.catch) started.catch(function () {});
            } else if (video.getAttribute("src")) {
              video.pause();
            }
          });
        },
        { rootMargin: "240px 0px", threshold: 0.01 }
      );
      Array.prototype.forEach.call(ambientVideos, function (el) {
        ambientIO.observe(el);
      });
    }
  }

  /* ------------------------------------------------------------ 4. Video */
  Array.prototype.forEach.call(document.querySelectorAll("[data-video]"), function (frame) {
    var video = frame.querySelector("video");
    var button = frame.querySelector(".video-play");
    if (!video || !button) return;

    button.addEventListener("click", function () {
      frame.classList.add("is-playing");
      video.controls = true;
      var play = video.play();
      if (play && play.catch) play.catch(function () {});
    });

    video.addEventListener("ended", function () {
      frame.classList.remove("is-playing");
      video.controls = false;
      video.currentTime = 0;
    });
  });

  /* ------------------------------------------------------------ 5. Form */
  var form = document.getElementById("quoteForm");

  /* 提交地址。默认走 Cloudflare Pages Function（functions/api/inquiry.js）。
     改用 Formspree 时只改这一行：https://formspree.io/f/你的表单ID
     两种方式字段名一致，密钥都留在服务端，不要写进这里。 */
  var INQUIRY_ENDPOINT = "/api/inquiry";

  if (form) {
    var status = document.getElementById("formStatus");
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function fieldWrap(el) {
      return el.closest(".field");
    }

    function setError(el, message) {
      var wrap = fieldWrap(el);
      if (!wrap) return;
      var slot = wrap.querySelector(".field-error");
      wrap.classList.add("has-error");
      el.setAttribute("aria-invalid", "true");
      if (slot) slot.textContent = message;
    }

    function clearError(el) {
      var wrap = fieldWrap(el);
      if (!wrap) return;
      wrap.classList.remove("has-error");
      el.removeAttribute("aria-invalid");
    }

    function validate(el) {
      var value = (el.value || "").trim();
      var type = el.dataset.validate;
      var label = el.dataset.label || "This field";

      if (el.required && !value) {
        setError(el, label + " is required.");
        return false;
      }
      if (!value) {
        clearError(el);
        return true;
      }
      if (type === "email" && !emailRe.test(value)) {
        setError(el, "Enter a valid work email, e.g. name@company.com.");
        return false;
      }
      if (type === "minlength" && value.length < Number(el.dataset.min || 10)) {
        setError(el, "Please add a little more detail (at least " + (el.dataset.min || 10) + " characters).");
        return false;
      }
      clearError(el);
      return true;
    }

    var watched = form.querySelectorAll("input, select, textarea");
    Array.prototype.forEach.call(watched, function (el) {
      el.addEventListener("blur", function () {
        if (el.dataset.validate || el.required) validate(el);
      });
      el.addEventListener("input", function () {
        var wrap = fieldWrap(el);
        if (wrap && wrap.classList.contains("has-error")) validate(el);
      });
    });

    /* pre-fill the enquiry type from ?product=SKU or ?product=system */
    try {
      var params = new URLSearchParams(window.location.search);
      var product = params.get("product");
      var interest = form.elements.interest;
      if (product && interest) {
        Array.prototype.forEach.call(interest.options, function (opt) {
          if (opt.value.toLowerCase() === product.toLowerCase()) interest.value = opt.value;
        });
        if (product.toUpperCase().indexOf("TL-") === 0) {
          form.elements.message.value = "Interested in " + product.toUpperCase() + ". Please send price, MOQ and lead time.";
        }
      }
    } catch (err) {
      /* older browsers: skip pre-fill */
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var ok = true;
      var firstBad = null;
      Array.prototype.forEach.call(watched, function (el) {
        if (el.type === "checkbox") {
          var lineError = el.required && !el.checked;
          el.closest(".checkline").style.color = lineError ? "#b44747" : "";
          if (lineError) {
            ok = false;
            if (!firstBad) firstBad = el;
          }
          return;
        }
        if (!validate(el)) {
          ok = false;
          if (!firstBad) firstBad = el;
        }
      });

      if (status) status.classList.remove("is-visible", "is-error");

      if (!ok) {
        if (firstBad) firstBad.focus();
        if (status) {
          status.classList.add("is-visible", "is-error");
          status.textContent = "Please check the highlighted fields and submit again.";
        }
        return;
      }

      /* ------------------------------------------------------------------
         SUBMISSION
         POST JSON 到 INQUIRY_ENDPOINT。默认实现是 Cloudflare Pages Function，
         也兼容 Formspree（字段名相同，服务端读取 payload 的 key）。
         密钥/发信配置只在服务端，前端只负责发请求和显示结果。
      ------------------------------------------------------------------ */

      var payload = {
        name: form.elements.fullName.value.trim(),
        company: form.elements.company.value.trim(),
        email: form.elements.email.value.trim(),
        country: form.elements.country.value.trim(),
        interest: form.elements.interest.value,
        volume: form.elements.volume.value.trim(),
        message: form.elements.message.value.trim(),
        source: window.location.pathname,
        _gotcha: form.elements._gotcha ? form.elements._gotcha.value : ""
      };

      var submitBtn = form.querySelector('button[type="submit"]');
      var submitHTML = submitBtn ? submitBtn.innerHTML : "";

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending…";
      }
      if (status) {
        status.classList.remove("is-visible", "is-error");
      }

      function restoreButton() {
        if (!submitBtn) return;
        submitBtn.disabled = false;
        submitBtn.innerHTML = submitHTML;
      }

      fetch(INQUIRY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json().catch(function () {
            return {};
          });
        })
        .then(function (body) {
          if (body && body.ok === false) throw new Error(body.error || "rejected");

          form.reset();
          Array.prototype.forEach.call(watched, clearError);

          if (status) {
            status.classList.remove("is-error");
            status.classList.add("is-visible");
            status.textContent =
              "Thank you — your inquiry has been received. Our export desk replies within two business days.";
            status.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        })
        .catch(function () {
          if (status) {
            status.classList.add("is-visible", "is-error");
            status.textContent =
              "Sorry — the form could not be sent just now. Please email sales@tuojieoutdoor.com directly, or try again in a minute.";
            status.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        })
        .then(restoreButton);
    });
  }

  /* ------------------------------------------- 6. Certificate slider */
  var slider = document.querySelector("[data-cert-slider]");
  if (slider) {
    var track = slider.querySelector("[data-cert-track]");
    var prev = slider.querySelector("[data-cert-prev]");
    var next = slider.querySelector("[data-cert-next]");

    function step() {
      var card = track.querySelector(".cert-card");
      if (!card) return 300;
      var gap = parseFloat(window.getComputedStyle(track).columnGap) || 18;
      return card.getBoundingClientRect().width + gap;
    }

    function sync() {
      var max = track.scrollWidth - track.clientWidth;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max - 2;
    }

    function scrollByCard(dir) {
      track.scrollBy({ left: step() * dir, behavior: "smooth" });
    }

    prev.addEventListener("click", function () { scrollByCard(-1); });
    next.addEventListener("click", function () { scrollByCard(1); });
    track.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();

    /* mouse drag */
    var down = false, startX = 0, startScroll = 0, moved = false;
    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse") return;
      down = true;
      moved = false;
      startX = e.clientX;
      startScroll = track.scrollLeft;
      track.classList.add("is-dragging");
      track.setPointerCapture(e.pointerId);
    });
    track.addEventListener("pointermove", function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      track.scrollLeft = startScroll - dx;
    });
    function endDrag(e) {
      if (!down) return;
      down = false;
      track.classList.remove("is-dragging");
      if (e && e.pointerId !== undefined && track.hasPointerCapture(e.pointerId)) {
        track.releasePointerCapture(e.pointerId);
      }
      if (moved) {
        var target = Math.round(track.scrollLeft / step()) * step();
        track.scrollTo({ left: target, behavior: "smooth" });
      }
    }
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
  }

  /* ------------------------------------------------------------- 7. Year */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
