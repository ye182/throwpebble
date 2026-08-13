/** Sublabel under calendar day numbers: festival name or lunar day. */

const SOLAR_FESTIVALS: Record<string, string> = {
  "01-01": "元旦",
  "02-14": "情人节",
  "03-08": "妇女节",
  "03-12": "植树节",
  "04-01": "愚人节",
  "05-01": "劳动节",
  "05-04": "青年节",
  "06-01": "儿童节",
  "07-01": "建党节",
  "08-01": "建军节",
  "09-10": "教师节",
  "10-01": "国庆节",
  "12-25": "圣诞",
};

const LUNAR_DAY_CN = [
  "",
  "初一",
  "初二",
  "初三",
  "初四",
  "初五",
  "初六",
  "初七",
  "初八",
  "初九",
  "初十",
  "十一",
  "十二",
  "十三",
  "十四",
  "十五",
  "十六",
  "十七",
  "十八",
  "十九",
  "二十",
  "廿一",
  "廿二",
  "廿三",
  "廿四",
  "廿五",
  "廿六",
  "廿七",
  "廿八",
  "廿九",
  "三十",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function solarFestival(d: Date): string | null {
  const key = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return SOLAR_FESTIVALS[key] ?? null;
}

/** Best-effort lunar day via Intl Chinese calendar (modern browsers). */
function lunarDayLabel(d: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      day: "numeric",
    }).formatToParts(d);
    const dayPart = parts.find((p) => p.type === "day")?.value;
    if (!dayPart) return "";
    const n = Number(dayPart);
    if (Number.isFinite(n) && n >= 1 && n <= 30) {
      return LUNAR_DAY_CN[n] || dayPart;
    }
    // Some engines already return 初一-style text
    if (/[初十廿三]/.test(dayPart)) return dayPart;
    return dayPart;
  } catch {
    return "";
  }
}

/** Festival name preferred; otherwise lunar day (e.g. 十三). */
export function calendarDaySublabel(d: Date): string {
  return solarFestival(d) ?? lunarDayLabel(d);
}
