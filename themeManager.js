// themeManager.js - FINAL FIXED VERSION - PERSISTENT
const defaultTheme = {
  primary: "#0f766e",
  sidebarBg: "#0f766e",
  bg: "#f0fdfa"
};

function applyTheme(t) {
  const theme = { ...defaultTheme, ...(t || {}) };
  const r = document.documentElement;
  
  r.style.setProperty('--p', theme.primary);
  r.style.setProperty('--p-light', theme.primary);
  r.style.setProperty('--p-border', theme.primary + '30');
  r.style.setProperty('--bg', theme.bg);
  r.style.setProperty('--sidebar-bg', theme.sidebarBg);
  r.style.setProperty('--primary', theme.primary);
  
  if(document.body) document.body.style.background = theme.bg;
}

async function loadAndApplyTheme() {
  try {
    let saved = null;
    if (window.api && window.api.getThemeDetails) {
      try { saved = await window.api.getThemeDetails(); } catch (e) {}
    }
    if (!saved) {
      try { saved = JSON.parse(localStorage.getItem('eduPulseTheme') || 'null'); } catch(e){}
    }
    if (!saved) {
      try { saved = JSON.parse(localStorage.getItem('theme') || 'null'); } catch(e){}
    }
    const finalTheme = { ...defaultTheme, ...(saved || {}) };
    applyTheme(finalTheme);

    const p1 = document.getElementById('pickPrimary');
    const p2 = document.getElementById('pickSidebar');
    const p3 = document.getElementById('pickBg');
    if (p1) p1.value = finalTheme.primary;
    if (p2) p2.value = finalTheme.sidebarBg;
    if (p3) p3.value = finalTheme.bg;

  } catch (e) {
    applyTheme(defaultTheme);
  }
}

async function saveTheme(theme) {
  const finalTheme = { ...defaultTheme, ...theme };
  // 1. Dono keys me save taake koi page miss na kare
  localStorage.setItem('eduPulseTheme', JSON.stringify(finalTheme));
  localStorage.setItem('theme', JSON.stringify(finalTheme));
  
  // 2. Permanent file me save
  if (window.api && window.api.saveThemeDetails) {
    try { await window.api.saveThemeDetails(finalTheme); } catch (e) { console.log(e); }
  }
  applyTheme(finalTheme);
}

async function applyCustomTheme() {
  const theme = {
    primary: document.getElementById('pickPrimary').value,
    sidebarBg: document.getElementById('pickSidebar').value,
    bg: document.getElementById('pickBg').value,
  };
  await saveTheme(theme); // IMPORTANT: await lagaya
  document.getElementById('themeModal').style.display = 'none';
  // Reload hata diya, zaroorat nahi - theme instant lag jayega
  // Agar reload chahiye to save ke baad karo
  // location.reload();
}

async function resetTheme() {
  localStorage.removeItem('eduPulseTheme');
  localStorage.removeItem('theme');
  await saveTheme(defaultTheme);
  document.getElementById('themeModal').style.display = 'none';
  location.reload();
}

// Auto load
loadAndApplyTheme();