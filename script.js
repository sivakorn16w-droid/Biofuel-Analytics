// ==========================================
// CONFIG: แก้ URL ตรงนี้จุดเดียวพอ
// ==========================================
const QUANTITY_DASHBOARD_URL = "https://sivakorn16w-droid.github.io/Quantity-Dashboard/";
const PRICE_DASHBOARD_URL = "https://sivakorn16w-droid.github.io/Price-Dashboard/";

const THEME_KEY = "biofuel-theme";
const root = document.documentElement;

// ==========================================
// Theme toggle
// ==========================================
function applyTheme(theme) {
  root.setAttribute("data-theme", theme === "light" ? "light" : "dark");
}

function getPreferredTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
  } catch (e) {
    // ignore
  }
  return "dark";
}

const themeToggle = document.getElementById("themeToggle");
themeToggle.addEventListener("click", () => {
  const current = root.getAttribute("data-theme") === "light" ? "light" : "dark";
  const next = current === "light" ? "dark" : "light";
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (e) {
    // ignore
  }
});

applyTheme(getPreferredTheme());

// ==========================================
// Language switch (visual state)
// ==========================================
const langSwitch = document.querySelector(".lang-switch");
const langSpans = langSwitch.querySelectorAll("span:not(.divider)");

langSwitch.addEventListener("click", () => {
  langSpans.forEach((span) => span.classList.toggle("active"));
  const activeLang = langSwitch.querySelector("span.active");
  root.setAttribute("lang", activeLang && activeLang.textContent.trim() === "EN" ? "en" : "th");
});

langSwitch.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    langSwitch.click();
  }
});

// ==========================================
// Dashboard: Quantity (link)
// ==========================================
const btnQuantity = document.getElementById("btnQuantity");
if (QUANTITY_DASHBOARD_URL && QUANTITY_DASHBOARD_URL !== "#") {
  btnQuantity.href = QUANTITY_DASHBOARD_URL;
} else {
  btnQuantity.removeAttribute("href");
}

const cardQuantity = document.querySelector(".card-quantity");
cardQuantity.addEventListener("click", (event) => {
  if (event.target.closest("#btnQuantity")) return; // let the link handle its own click
  btnQuantity.click();
});
cardQuantity.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    btnQuantity.click();
  }
});

// ==========================================
// Dashboard: Price
// ==========================================
const btnPrice = document.getElementById("btnPrice");

if (btnPrice) {
  btnPrice.href = PRICE_DASHBOARD_URL;
}
