// school.js - SINGLE SOURCE OF TRUTH
const fs = require("fs");
const path = require("path");

const ACTIVE_SCHOOL = "TECHINFO"; // KIPS | EAGLES | RAHBAR | ISLAMIA | TECHINFO

const SCHOOL_THEMES = {
  KIPS: {
    studentCardHeaderBg: "#04A0E8",
    studentCardHeaderText: "#ffffff",
    studentCardSmallText: "#ffffff",
    studentCardFooterBg: "#04A0E8",
    staffCardHeaderBg: "#f58012",
    staffCardHeaderText: "#f3f3f3",
    staffCardSmallText: "#f3f3f3",
    staffCardFooterBg: "#f58012",
    sidebarBg: "#030303",
    sidebarActive: "#f84040",
    cardPrimary: "#f84040",
    cardSecondary: "#ffffff",
    cardFooterBg: "#04A0E8",
    primary: "#4f46e5",
    heading1: "#ffffff",
    heading2: "#ffffff",
    heading3: "#ffffff",
  },
  EAGLES: {
    studentCardHeaderBg: "#03791d",
    studentCardHeaderText: "#ffffff",
    studentCardSmallText: "#ffffff",
    studentCardFooterBg: "#03791d",
    staffCardHeaderBg: "#010c1f",
    staffCardHeaderText: "#f3f3f3",
    staffCardSmallText: "#f3f3f3",
    staffCardFooterBg: "#010c1f",
    sidebarBg: "#030303",
    sidebarActive: "#f84040",
    cardPrimary: "#f84040",
    cardSecondary: "#ffffff",
    cardFooterBg: "#02245a",
    primary: "#4f46e5",
    heading1: "#ffffff",
    heading2: "#ffffff",
    heading3: "#ffffff",
  },
  RAHBAR: {
    studentCardHeaderBg: "#073F89",
    studentCardHeaderText: "#ffffff",
    studentCardSmallText: "#ffffff",
    studentCardFooterBg: "#073F89",
    staffCardHeaderBg: "#073F89",
    staffCardHeaderText: "#ffffff",
    staffCardSmallText: "#f3f3f3",
    staffCardFooterBg: "#f72004",
    sidebarBg: "#030303",
    sidebarActive: "#f84040",
    cardPrimary: "#f84040",
    cardSecondary: "#ffffff",
    cardFooterBg: "#E77918",
    primary: "#4f46e5",
    heading1: "#ffffff",
    heading2: "#ffffff",
    heading3: "#ffffff",
  },
  ISLAMIA: {
    studentCardHeaderBg: "#03791d",
    studentCardHeaderText: "#ffffff",
    studentCardSmallText: "#ffffff",
    studentCardFooterBg: "#03791d",
    staffCardHeaderBg: "#073F89",
    staffCardHeaderText: "#ffffff",
    staffCardSmallText: "#f3f3f3",
    staffCardFooterBg: "#073F89",
    sidebarBg: "#030303",
    sidebarActive: "#f84040",
    cardPrimary: "#f84040",
    cardSecondary: "#ffffff",
    cardFooterBg: "#02245a",
    primary: "#4f46e5",
    heading1: "#ffffff",
    heading2: "#ffffff",
    heading3: "#ffffff",
  },
  TECHINFO: {
    studentCardHeaderBg: "#020e7c",
    studentCardHeaderText: "#ffffff",
    studentCardSmallText: "#ffffff",
    studentCardFooterBg: "#020e7c",
    staffCardHeaderBg: "#020e7c",
    staffCardHeaderText: "#ffffff",
    staffCardSmallText: "#ffffff",
    staffCardFooterBg: "#020e7c",
    sidebarBg: "#030303",
    sidebarActive: "#f84040",
    cardPrimary: "#f84040",
    cardSecondary: "#ffffff",
    cardFooterBg: "#020e7c",
    primary: "#4f46e5",
    heading1: "#ffffff",
    heading2: "#ffffff",
    heading3: "#ffffff",
  },
};

const SCHOOL_DETAILS = {
  KIPS: {
    shortName: "KIPS",
    logo: "logo-kips.png",
    slcFile: "slc_kips.html",
    expiry: "2099-06-30",
    instituteName: "Kauthar Ideal Public School (KIPS)",
    contactNumber: "03708087772 | 0512249471",
    email: "mahboobbalti110@gmail.com",
    address: "Jigyot Road Old Bank Stop Alipur, Islamabad",
    account: "Bank Al Habib Ltd (Acc # 0307-0981-005634-01-3)",
    footerText: "EduPulse System Engine © 2026",
    watermark: "Yes",
  },
  ISLAMIA: {
    shortName: "ISLAMIA",
    logo: "logo-islamia.png",
    expiry: "2099-06-30",
    slcFile: "slc_islamia.html",
    instituteName: "Islamia Model School",
    contactNumber: "0300-9813940",
    email: "imssohan1987@gmail.com",
    address: "Sohan, Islamabad",
    account: "HBL Account No: 17420009698101",
    footerText: "EduPulse System Engine © 2026",
    watermark: "Yes",
  },
  EAGLES: {
    shortName: "EAGLES",
    logo: "logo-Eagle's Nest School System.png",
    expiry: "2099-08-15",
    slcFile: "slc_eagles.html",
    instituteName: "Eagle's Nest School System",
    contactNumber: "0312-1123205",
    email: "eaglesnestenss@gmail.com",
    address: "Ghusia Muhallah Hamdani town Alipur Islamabad",
    footerText: "EduPulse System Engine © 2026",
    watermark: "Yes",
  },
  RAHBAR: {
    shortName: "RAHBAR",
    logo: "logo-Rahbar Public School.png",
    expiry: "2027-03-01",
    slcFile: "slc_rahbar.html",
    instituteName: "Rahbar Public School",
    contactNumber: "03151436832",
    email: "asadaslam60@gmail.com",
    address: "Pore Garhi, Habibullah",
    account: "Easypaisa No: 03424449242",
    footerText: "EduPulse System Engine © 2026",
    watermark: "No", // <-- Sirf iske liye watermark OFF hoga
  },
  TECHINFO: {
    shortName: "TECHINFO",
    logo: "logo-tech.png",
    expiry: "2026-10-30",
    slcFile: "slc_template.html",
    instituteName: "Techinfo",
    contactNumber: "0311-5101738",
    email: "techhinfolab360@gmail.com",
    address: "Islamabad",
    footerText: "EduPulse System Engine © 2026",
    watermark: "Yes",
  },
};

const SCHOOL_CODES = {
  KIPS: "KIPS_2026",
  EAGLES: "EAGLES_2026",
  RAHBAR: "RAHBAR_2026",
  ISLAMIA: "ISLAMIA_1987",
  TECHINFO: "TECHINFO_2026",
};

const SCHOOL_CODE = SCHOOL_CODES[ACTIVE_SCHOOL];
const appTheme = SCHOOL_THEMES[ACTIVE_SCHOOL];
const currentSchoolDetails = SCHOOL_DETAILS[ACTIVE_SCHOOL];

(function syncLogo() {
  try {
    const src = path.join(process.cwd(), "images", currentSchoolDetails.logo);
    const dest = path.join(process.cwd(), "images", "logo.png");
    if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  } catch (e) {}
})();

module.exports = {
  ACTIVE_SCHOOL,
  SCHOOL_THEMES,
  SCHOOL_DETAILS,
  SCHOOL_CODES,
  SCHOOL_CODE,
  appTheme,
  currentSchoolDetails,
};