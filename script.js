const DATA_URL = "data-banjir-bogor.geojson";

const CLASS_ORDER = ["Tinggi", "Cukup Tinggi", "Sedang", "Cukup Rendah", "Sangat Rendah"];
const CLASS_META = {
  "Tinggi":        { badge: "badge-k1", color: "#d7191c", desc: "Prioritas pemantauan tertinggi." },
  "Cukup Tinggi":  { badge: "badge-k2", color: "#fdae61", desc: "Perlu kewaspadaan saat hujan lebat." },
  "Sedang":        { badge: "badge-k3", color: "#ffcc00", desc: "Potensi genangan pada hujan menerus." },
  "Cukup Rendah":  { badge: "badge-k4", color: "#a6d96a", desc: "Dampak umumnya terbatas." },
  "Sangat Rendah": { badge: "badge-k5", color: "#1a9641", desc: "Risiko banjir relatif kecil." },
};

const FALLBACK_SUMMARY = [
  { kelas: "Tinggi",        jumlah: 10, luas: 0.46 },
  { kelas: "Cukup Tinggi",  jumlah: 70, luas: 2.61 },
  { kelas: "Sedang",        jumlah: 89, luas: 8.43 },
  { kelas: "Cukup Rendah",  jumlah: 86, luas: 2.38 },
  { kelas: "Sangat Rendah", jumlah: 18, luas: 1.06 },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LAT0 = -6.59;
const KX = 111.320 * Math.cos((LAT0 * Math.PI) / 180); 
const KY = 110.574;                                     

function ringKm2(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    s += x1 * y2 - x2 * y1;
  }
  return (Math.abs(s) / 2) * KX * KY;
}

function geometryKm2(geometry) {
  if (!geometry) return 0;
  const polys = geometry.type === "MultiPolygon"
    ? geometry.coordinates
    : [geometry.coordinates];
  let area = 0;
  polys.forEach((poly) => {
    poly.forEach((ring, i) => {
      area += i === 0 ? ringKm2(ring) : -ringKm2(ring); 
    });
  });
  return area;
}

async function fetchGeoJSON({ forceError = false } = {}) {
  if (forceError) {
    await delay(600);
    throw new Error("Simulasi error: permintaan data sengaja digagalkan.");
  }

  await delay(700); 

  const res = await fetch(DATA_URL);
  if (!res.ok) {
    throw new Error(`Gagal memuat data (status ${res.status}).`);
  }
  const json = await res.json();
  const features = json.features || (Array.isArray(json) ? json : []);
  if (!features.length) {
    throw new Error("Data berhasil diambil, tetapi kosong.");
  }
  return features;
}

function summarize(features) {
  const acc = {};
  features.forEach((f) => {
    const kelas = (f.properties && f.properties.Kelas) || "Lainnya";
    if (!acc[kelas]) acc[kelas] = { kelas, jumlah: 0, luas: 0 };
    acc[kelas].jumlah += 1;
    acc[kelas].luas += geometryKm2(f.geometry);
  });
  return Object.values(acc).sort((a, b) => {
    const ia = CLASS_ORDER.indexOf(a.kelas);
    const ib = CLASS_ORDER.indexOf(b.kelas);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

function buildCard(item, total) {
  const meta = CLASS_META[item.kelas] || { badge: "badge-k5", desc: "" };
  const persen = total ? ((item.jumlah / total) * 100).toFixed(1) : "0";

  const card = document.createElement("article");
  card.className = "apartment-card";
  card.innerHTML = `
    <div class="apartment-card-head">
      <h3>Kelas ${item.kelas}</h3>
      <span class="badge ${meta.badge}">${item.jumlah} zona</span>
    </div>
    <p class="apartment-address">&#127754; Tingkat bahaya banjir: <strong>${item.kelas}</strong></p>
    <p class="apartment-meta">${persen}% dari total zona &middot; &plusmn; ${item.luas.toFixed(2)} km&sup2; (perkiraan)</p>
    <p class="apartment-facility-label">Keterangan:</p>
    <div class="facility-tags"><span class="facility-tag">${meta.desc}</span></div>
  `;
  return card;
}

function renderCards(container, summary) {
  const total = summary.reduce((s, it) => s + it.jumlah, 0);
  const fragment = document.createDocumentFragment();
  summary.forEach((it) => fragment.appendChild(buildCard(it, total)));
  container.appendChild(fragment);
}

async function loadData({ forceError = false } = {}) {
  const loadingEl = document.getElementById("data-loading");
  const errorEl = document.getElementById("data-error");
  const errorMsgEl = document.getElementById("data-error-message");
  const listEl = document.getElementById("apartment-list");
  const noteEl = document.getElementById("data-note");

  if (!listEl) return;

  loadingEl.style.display = "flex";
  errorEl.style.display = "none";
  listEl.innerHTML = "";
  if (noteEl) noteEl.textContent = "";

  try {
    const features = await fetchGeoJSON({ forceError });
    const summary = summarize(features);

    renderCards(listEl, summary);
    const total = summary.reduce((s, it) => s + it.jumlah, 0);
    if (noteEl) {
      noteEl.textContent = `Menampilkan ${total} zona (fetch dari ${DATA_URL}), diringkas menjadi ${summary.length} kelas bahaya.`;
    }
  } catch (err) {
    errorEl.style.display = "block";
    if (errorMsgEl) errorMsgEl.textContent = err.message;

    if (!forceError) {
      renderCards(listEl, FALLBACK_SUMMARY);
      if (noteEl) noteEl.textContent = "Menampilkan data cadangan bawaan (fetch gagal).";
    }
  } finally {
    loadingEl.style.display = "none";
  }
}

function initInteractions() {
  const colorBox = document.getElementById("color-box");
  const colorBtn = document.getElementById("color-btn");
  if (colorBox && colorBtn) {
    const palette = ["#0f75bc", "#d7191c", "#fdae61", "#1a9641", "#6a4c93"];
    let idx = 0;
    colorBtn.addEventListener("click", () => {
      idx = (idx + 1) % palette.length;
      colorBox.style.backgroundColor = palette[idx];
      colorBox.textContent = palette[idx].toUpperCase();
    });
  }

  const infoPanel = document.getElementById("info-panel");
  const toggleBtn = document.getElementById("toggle-btn");
  if (infoPanel && toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const hidden = infoPanel.classList.toggle("is-hidden");
      toggleBtn.textContent = hidden ? "Tampilkan Info" : "Sembunyikan Info";
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initInteractions();

  const reloadBtn = document.getElementById("reload-btn");
  const retryBtn = document.getElementById("retry-btn");
  const errorCheckbox = document.getElementById("simulate-error");

  if (reloadBtn) {
    reloadBtn.addEventListener("click", () =>
      loadData({ forceError: errorCheckbox && errorCheckbox.checked })
    );
  }
  if (retryBtn) {
    retryBtn.addEventListener("click", () => loadData({ forceError: false }));
  }

  if (document.getElementById("apartment-list")) {
    loadData();
  }
});
