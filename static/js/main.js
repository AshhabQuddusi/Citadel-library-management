 
/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
var _pendingBookId   = null;
var _pendingBookData = null;
var _debounceTimer   = null;
var _abpDebounce     = null;
var _abpGenre        = "All";
var _lookupTimer     = null;
var _allBooksLoaded  = false;
var _ctrsStarted     = false;

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", function () {
  buildFloatingBooks();
  buildMarquee();
  buildShelf();
  initReveal();
  loadNewBooks();
  window.addEventListener("scroll", onScroll);
  document.querySelectorAll(".modal-overlay").forEach(function (o) {
    o.addEventListener("click", function (e) {
      if (e.target === o) o.classList.remove("active");
    });
  });
});

/* ═══════════════════════════════════════════
   API
═══════════════════════════════════════════ */
function apiGet(url) {
  return fetch(url).then(function (r) {
    return r.json().then(function (d) { if (!r.ok) throw d; return d; });
  });
}
function apiPost(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(function (r) {
    return r.json().then(function (d) { if (!r.ok) throw d; return d; });
  });
}

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function toast(msg, type, dur) {
  type = type || "info"; dur = dur || 5000;
  var el = document.createElement("div");
  el.className = "toast-item toast-" + type;
  el.textContent = msg;
  document.getElementById("toast").appendChild(el);
  setTimeout(function () {
    el.style.transition = "all 0.4s";
    el.style.opacity = "0";
    el.style.transform = "translateX(30px)";
    setTimeout(function () { el.remove(); }, 400);
  }, dur);
}

/* ═══════════════════════════════════════════
   MODALS
═══════════════════════════════════════════ */
function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

/* ═══════════════════════════════════════════
   CONFIRMATION MODAL (top-centre)
═══════════════════════════════════════════ */
function showConfirm(icon, title, bodyHtml) {
  document.getElementById("confirmIcon").textContent  = icon;
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmBody").innerHTML    = bodyHtml;
  document.getElementById("confirmModal").classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ═══════════════════════════════════════════
   HOME ↔ ALL-BOOKS PAGE SWITCH
═══════════════════════════════════════════ */
function showAllBooksPage() {
  document.getElementById("homePage").style.display     = "none";
  document.getElementById("allBooksPage").style.display = "block";
  window.scrollTo({ top: 0, behavior: "instant" });
  if (!_allBooksLoaded) {
    _allBooksLoaded = true;
    loadAbpGenres();
    loadAbpBooks();
  }
}
function showHomePage() {
  document.getElementById("allBooksPage").style.display = "none";
  document.getElementById("homePage").style.display     = "block";
  window.scrollTo({ top: 0, behavior: "instant" });
}

/* ═══════════════════════════════════════════
   ALL BOOKS PAGE (abp*)
═══════════════════════════════════════════ */
function loadAbpGenres() {
  apiGet("/api/genres").then(function (genres) {
    var pills = document.getElementById("abpGenrePills");
    if (!pills) return;
    pills.innerHTML = genres.map(function (g) {
      return '<button class="gpill' + (g === "All" ? " active" : "") +
        '" onclick="setAbpGenre(\'' + escAttr(g) + '\')">' + escHtml(g) + '</button>';
    }).join("");
  }).catch(function () {});
}

function setAbpGenre(g) {
  _abpGenre = g;
  document.querySelectorAll("#abpGenrePills .gpill").forEach(function (b) {
    b.classList.toggle("active", b.textContent === g);
  });
  loadAbpBooks();
}

function debounceAbpFilter() {
  var clr = document.getElementById("abpSearchClear");
  if (clr) clr.style.display = (document.getElementById("abpSearch").value || "") ? "block" : "none";
  clearTimeout(_abpDebounce);
  _abpDebounce = setTimeout(loadAbpBooks, 320);
}
function clearAbpSearch() {
  var s = document.getElementById("abpSearch");
  var c = document.getElementById("abpSearchClear");
  if (s) { s.value = ""; s.focus(); }
  if (c) c.style.display = "none";
  loadAbpBooks();
}
function filterAbpBooks() { loadAbpBooks(); }

function loadAbpBooks() {
  var search = (document.getElementById("abpSearch")  || { value: "" }).value;
  var sort   = (document.getElementById("abpSort")    || { value: "" }).value;
  var params = [];
  if (_abpGenre && _abpGenre !== "All") params.push("genre="  + encodeURIComponent(_abpGenre));
  if (search)  params.push("search=" + encodeURIComponent(search));
  if (sort)    params.push("sort="   + encodeURIComponent(sort));
  var url = "/api/books" + (params.length ? "?" + params.join("&") : "");

  var ld   = document.getElementById("abpLoading");
  var grid = document.getElementById("abpGrid");
  var info = document.getElementById("abpResultsInfo");
  var cnt  = document.getElementById("abpCount");
  if (ld)   ld.style.display = "flex";
  if (grid) grid.innerHTML   = "";
  if (info) info.textContent = "";

  apiGet(url).then(function (books) {
    if (ld)   ld.style.display = "none";
    if (cnt)  cnt.textContent  = books.length;
    if (info) info.textContent = books.length + " book" + (books.length !== 1 ? "s" : "") + " found";
    if (!grid) return;
    if (!books.length) {
      grid.innerHTML = '<p style="color:var(--warm-grey);font-size:.9rem;grid-column:1/-1;padding:1.5rem 0">No books found. Try a different search or genre.</p>';
      return;
    }
    grid.innerHTML = books.map(function (b) { return renderCard(b); }).join("");
    initReveal();
  }).catch(function () {
    if (ld) ld.style.display = "none";
  });
}

/* ═══════════════════════════════════════════
   NEW ARRIVALS
═══════════════════════════════════════════ */
function loadNewBooks() {
  var grid = document.getElementById("newGrid");
  if (!grid) return;
  apiGet("/api/books/new").then(function (books) {
    if (!books.length) { grid.innerHTML = "<p>No new arrivals yet.</p>"; return; }
    grid.innerHTML = books.map(function (b) { return renderCard(b); }).join("");
    initReveal();
  }).catch(function () {});
}

/* ═══════════════════════════════════════════
   RENDER BOOK CARD
═══════════════════════════════════════════ */
/* Warm book-spine colours — earthy, academic */
var CARD_COLORS = [
  "#56624E","#7B4F2E","#A8B89A","#C9A66B","#2F2B27","#7A9068",
  "#9B7B4A","#4A5C42","#6B5540","#8B7355","#5C7A5A","#7B6A4E"
];

function renderCard(b) {
  var color = b.color || CARD_COLORS[b.id % CARD_COLORS.length] || "#56624E";
  var avBadge  = b.available
    ? '<span class="bk-badge badge-av">Available</span>'
    : '<span class="bk-badge badge-out">Checked Out</span>';
  var newBadge = b.new ? '<span class="bk-new-badge">New</span>' : "";

  return (
    '<a class="bk-card reveal" href="/book/' + b.id + '">' +
      '<div class="bk-cover">' +
        '<img class="bk-img" src="' + b.cover + '" alt="' + escHtml(b.title) +
          '" loading="lazy" onerror="handleImgErr(this)"/>' +
        '<div class="bk-fallback" style="background:' + color + '">' +
          '<div class="bkf-spine" style="background:' + color + '"></div>' +
          '<div class="bkf-genre">'  + escHtml(b.genre)  + '</div>' +
          '<div class="bkf-title">'  + escHtml(b.title)  + '</div>' +
          '<div class="bkf-author">' + escHtml(b.author) + '</div>' +
        '</div>' +
        avBadge + newBadge +
      '</div>' +
      '<div class="bk-meta">' +
        '<div>' +
          '<div class="bk-title">'  + escHtml(b.title)  + '</div>' +
          '<div class="bk-author">by ' + escHtml(b.author) + '</div>' +
        '</div>' +
        '<div class="bk-footer">' +
          '<span class="bk-genre-tag">' + escHtml(b.genre) + '</span>' +
          '<span class="bk-free">Free Rental</span>' +
        '</div>' +
      '</div>' +
    '</a>'
  );
}

function handleImgErr(img) {
  img.style.display = "none";
  var fb = img.nextElementSibling;
  if (fb) fb.classList.add("show");
}

/* ═══════════════════════════════════════════
   RENT MODAL
═══════════════════════════════════════════ */
function openRentModal(bookId) {
  _pendingBookId = bookId;
  if (bookId) {
    apiGet("/api/books/" + bookId).then(function (book) {
      _pendingBookData = book;
      var prev = document.getElementById("rentBookPreview");
      if (prev) {
        prev.innerHTML =
          '<img src="' + book.cover + '" alt="' + escHtml(book.title) +
          '" style="width:52px;height:75px;object-fit:cover;border-radius:8px;flex-shrink:0;border:1px solid var(--divider)" onerror="this.style.display=\'none\'"/>' +
          '<div>' +
          '<div style="font-family:\'Playfair Display\',serif;font-weight:700;color:var(--charcoal);font-size:.95rem">' + escHtml(book.title) + '</div>' +
          '<div style="font-size:.77rem;font-style:italic;color:var(--warm-grey);margin-top:.2rem">by ' + escHtml(book.author) + '</div>' +
          '</div>';
      }
    }).catch(function () {});
  }
  ["rentName", "rentEmail", "rentCard"].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = "";
  });
  var err = document.getElementById("rentError");
  if (err) err.textContent = "";
  resetRentBtn();
  document.getElementById("rentModal").classList.add("active");
  setTimeout(function () {
    var n = document.getElementById("rentName"); if (n) n.focus();
  }, 200);
}

function submitRent(bookIdArg) {
  var bookId = bookIdArg || _pendingBookId;
  var name   = (document.getElementById("rentName").value  || "").trim();
  var email  = (document.getElementById("rentEmail").value || "").trim();
  var card   = (document.getElementById("rentCard").value  || "").trim();
  var errEl  = document.getElementById("rentError");

  if (!name || !email || !card) { errEl.textContent = "Please fill in all three fields."; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = "Please enter a valid email address."; return; }
  if (card.length < 3) { errEl.textContent = "Please enter a valid library card number."; return; }
  errEl.textContent = "";

  var btn = document.getElementById("rentSubmitBtn");
  btn.disabled = true;
  document.getElementById("rentBtnTxt").style.display  = "none";
  document.getElementById("rentSpinner").style.display = "block";

  apiPost("/api/rent", { book_id: bookId, name: name, email: email, card_no: card })
    .then(function (data) {
      closeModal("rentModal");
      resetRentBtn();
      loadNewBooks();
      if (_allBooksLoaded) loadAbpBooks();

      var emailNote = (data.email_status === "sent")
        ? '<p style="margin-top:.8rem;font-size:.77rem;color:var(--olive)">✅ Confirmation email sent to <strong>' + escHtml(email) + '</strong></p>'
        : '<p style="margin-top:.8rem;font-size:.77rem;color:var(--overdue)">⚠️ Email could not be sent — please note your details above.</p>';

      showConfirm("📚", "Rental Confirmed!",
        '<p>Your rental has been confirmed.</p>' +
        '<div class="conf-detail">' +
        '<div class="conf-row"><span class="conf-label">Card No.</span><span class="conf-val">' + escHtml(card) + '</span></div>' +
        '<div class="conf-row"><span class="conf-label">Rented On</span><span class="conf-val">' + escHtml(data.rent_date) + '</span></div>' +
        '<div class="conf-row"><span class="conf-label">Due Date</span><span class="conf-val" style="color:var(--overdue)">' + escHtml(data.due_date) + '</span></div>' +
        '</div>' +
        '<p>📍 Visit the library counter and present card <strong>' + escHtml(card) + '</strong> to collect your book.</p>' +
        emailNote
      );
    })
    .catch(function (err) {
      errEl.textContent = err.error || "Could not complete rental. Please try again.";
      resetRentBtn();
    });
}

function resetRentBtn() {
  var btn = document.getElementById("rentSubmitBtn");
  if (!btn) return;
  btn.disabled = false;
  document.getElementById("rentBtnTxt").style.display  = "inline";
  document.getElementById("rentSpinner").style.display = "none";
}

function switchToCard() {
  closeModal("rentModal");
  setTimeout(function () { openCardModal(); }, 200);
}

/* ═══════════════════════════════════════════
   RETURN
═══════════════════════════════════════════ */
function openReturn() {
  ["retCard"].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ""; });
  var l = document.getElementById("retList"); if (l) l.innerHTML = "";
  var e = document.getElementById("retError"); if (e) e.textContent = "";
  document.getElementById("returnModal").classList.add("active");
}

var _lookupTimer = null;
function lookupRentals() {
  clearTimeout(_lookupTimer);
  _lookupTimer = setTimeout(function () {
    var card = (document.getElementById("retCard").value || "").trim();
    var list = document.getElementById("retList");
    var err  = document.getElementById("retError");
    if (err) err.textContent = "";
    if (!card || card.length < 3) { list.innerHTML = ""; return; }
    apiGet("/api/my-rentals?card_no=" + encodeURIComponent(card))
      .then(function (rentals) {
        if (!rentals.length) {
          list.innerHTML = '<p style="font-size:.82rem;color:var(--warm-grey);padding:.8rem 0">No active rentals found for this card number.</p>';
          return;
        }
        list.innerHTML = rentals.map(function (r) {
          return '<div class="ret-rental-item">' +
            '<div><div class="rti-title">' + escHtml(r.book_title) + '</div>' +
            '<div class="rti-due">Due: ' + r.due_date + '</div></div>' +
            '<button class="rti-ret-btn" onclick="submitReturn(' + r.book_id + ',\'' + escAttr(card) + '\')">Return</button>' +
            '</div>';
        }).join("");
      })
      .catch(function () {
        list.innerHTML = '<p style="font-size:.82rem;color:var(--overdue)">Could not look up rentals. Please try again.</p>';
      });
  }, 380);
}

function submitReturn(bookId, cardNo) {
  apiPost("/api/return", { book_id: bookId, card_no: cardNo })
    .then(function (data) {
      closeModal("returnModal");
      loadNewBooks();
      if (_allBooksLoaded) loadAbpBooks();
      showConfirm("↩️", "Book Returned!",
        '<p>' + escHtml(data.message) + '</p>' +
        '<p style="margin-top:.8rem">Thank you for returning on time! Visit us again for your next read.</p>'
      );
    })
    .catch(function (err) {
      var e = document.getElementById("retError");
      if (e) e.textContent = err.error || "Could not process return.";
    });
}

/* ═══════════════════════════════════════════
   LIBRARY CARD
═══════════════════════════════════════════ */
function openCardModal() {
  ["cardName", "cardEmail", "cardPhone"].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = "";
  });
  var err = document.getElementById("cardError"); if (err) err.textContent = "";
  resetCardBtn();
  updateCardMock();
  document.getElementById("cardModal").classList.add("active");
  setTimeout(function () { var n = document.getElementById("cardName"); if (n) n.focus(); }, 200);
}

function updateCardMock() {
  var name = (document.getElementById("cardName") || { value: "" }).value.trim();
  var el   = document.getElementById("cardMockName");
  if (el) el.textContent = name || "Your Name";
}

function submitCardRequest() {
  var name  = (document.getElementById("cardName").value  || "").trim();
  var email = (document.getElementById("cardEmail").value || "").trim();
  var phone = (document.getElementById("cardPhone").value || "").trim();
  var errEl = document.getElementById("cardError");

  if (!name || !email) { errEl.textContent = "Name and email are required."; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = "Please enter a valid email address."; return; }
  errEl.textContent = "";

  var btn = document.getElementById("cardSubmitBtn");
  btn.disabled = true;
  document.getElementById("cardBtnTxt").style.display  = "none";
  document.getElementById("cardSpinner").style.display = "block";

  apiPost("/api/get-card", { name: name, email: email, phone: phone })
    .then(function (data) {
      closeModal("cardModal");
      resetCardBtn();
      var mn = document.getElementById("cardMockNum"); if (mn) mn.textContent = data.card_no;

      var emailNote = (data.email_status === "sent")
        ? '<p style="margin-top:.8rem;font-size:.77rem;color:var(--olive)">✅ Card number emailed to <strong>' + escHtml(email) + '</strong></p>'
        : '<p style="margin-top:.8rem;font-size:.77rem;color:var(--overdue)">⚠️ Email could not be sent. Please save your card number now.</p>';

      showConfirm("🪪", "Library Card Issued!",
        '<p>Welcome to Central Library, <strong>' + escHtml(data.name) + '</strong>!</p>' +
        '<div class="conf-detail">' +
        '<div class="conf-row"><span class="conf-label">Your Card Number</span>' +
        '<span class="conf-val" style="font-family:monospace;font-size:1rem;letter-spacing:.1em;color:var(--brass)">' + escHtml(data.card_no) + '</span></div>' +
        '<div class="conf-row"><span class="conf-label">Issued On</span><span class="conf-val">' + escHtml(data.issued) + '</span></div>' +
        '</div>' +
        '<p>📍 Collect your <strong>physical card</strong> from the library counter — bring a photo ID.</p>' +
        emailNote
      );
    })
    .catch(function (err) {
      errEl.textContent = err.error || "Could not issue card. Please try again.";
      resetCardBtn();
    });
}

function resetCardBtn() {
  var btn = document.getElementById("cardSubmitBtn"); if (!btn) return;
  btn.disabled = false;
  document.getElementById("cardBtnTxt").style.display  = "inline";
  document.getElementById("cardSpinner").style.display = "none";
}

/* ═══════════════════════════════════════════
   COUNTERS
═══════════════════════════════════════════ */
function animCounter(el) {
  var tgt = +el.dataset.target, dur = 1800, step = tgt / (dur / 16), cur = 0;
  var t = setInterval(function () {
    cur = Math.min(cur + step, tgt);
    el.textContent = Math.floor(cur).toLocaleString();
    if (cur >= tgt) clearInterval(t);
  }, 16);
}

/* ═══════════════════════════════════════════
   SCROLL REVEAL
═══════════════════════════════════════════ */
function initReveal() {
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll(".reveal,.rev-l,.rev-r,.step-card").forEach(function (el) {
    if (!el.classList.contains("visible")) io.observe(el);
  });
  var sio = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting && !_ctrsStarted) {
        _ctrsStarted = true;
        document.querySelectorAll(".counter").forEach(animCounter);
      }
    });
  }, { threshold: 0.3 });
  var band = document.querySelector(".stats-band");
  if (band) sio.observe(band);
}

function onScroll() {
  var nav = document.getElementById("navbar");
  if (nav) nav.classList.toggle("scrolled", window.scrollY > 60);
}

/* ═══════════════════════════════════════════
   HERO FLOATING BOOKS — academic spine tones
═══════════════════════════════════════════ */
var FLOAT_COLORS = [
  "#56624E","#7B4F2E","#A8B89A","#C9A66B",
  "#2F2B27","#7A9068","#9B7B4A","#4A5C42",
  "#6B5540","#8B7355","#5C7A5A","#7B6A4E"
];

function buildFloatingBooks() {
  var wrap = document.getElementById("fbWrap");
  if (!wrap) return;
  for (var i = 0; i < 22; i++) {
    var b = document.createElement("div");
    b.className = "fb";
    b.style.cssText =
      "left:"               + (Math.random() * 100) + "%;" +
      "height:"             + (26 + Math.random() * 84) + "px;" +
      "background:"         + FLOAT_COLORS[i % FLOAT_COLORS.length] + ";" +
      "--r:"                + (-18 + Math.random() * 36) + "deg;" +
      "animation-duration:" + (9 + Math.random() * 14) + "s;" +
      "animation-delay:"    + (-Math.random() * 20) + "s;";
    wrap.appendChild(b);
  }
}

/* ═══════════════════════════════════════════
   MARQUEE
═══════════════════════════════════════════ */
function buildMarquee() {
  var inner = document.getElementById("mqInner");
  if (!inner) return;
  var items = [
    "Fiction","Science","History","Philosophy","Technology","Literature",
    "Mathematics","Biography","Psychology","Business","Self-Help","Software Craft","Programming"
  ];
  inner.innerHTML = items.concat(items).map(function (i) {
    return '<span class="mq-item">' + i + '</span><span class="mq-dot">&middot;</span>';
  }).join("");
}

/* ═══════════════════════════════════════════
   SHELF — warm earthy spine colours
═══════════════════════════════════════════ */
var SHELF_COLORS = [
  "#56624E","#7B4F2E","#A8B89A","#C9A66B","#2F2B27","#7A9068",
  "#9B7B4A","#4A5C42","#6B5540","#8B7355","#5C7A5A","#7B6A4E",
  "#56624E","#C9A66B","#7B4F2E","#A8B89A","#9B7B4A","#4A5C42",
  "#6B5540","#2F2B27","#7A9068","#8B7355","#5C7A5A","#7B6A4E",
  "#56624E","#7B4F2E","#C9A66B","#A8B89A","#9B7B4A","#2F2B27"
];

function buildShelf() {
  var row = document.getElementById("shelfRow");
  if (!row) return;
  SHELF_COLORS.forEach(function (color) {
    var el = document.createElement("div");
    el.className = "sb";
    el.style.cssText =
      "height:"     + (108 + Math.random() * 84) + "px;" +
      "width:"      + (16  + Math.random() * 18) + "px;" +
      "background:" + color + ";";
    row.appendChild(el);
  });
}

/* ═══════════════════════════════════════════
   ESCAPE HELPERS
═══════════════════════════════════════════ */
function escHtml(s) {
  return String(s)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#039;");
}
function escAttr(s) {
  return String(s).replace(/'/g, "\\'").replace(/"/g, "&quot;");
}
