# 项目三 · 日历墙（嵌入里程碑）

**定位**：项目三（日历墙）内容**嵌入本仓库（项目二 / Aimu 日记森林）**，不拆独立「项目三」目录或仓库。

**融合方案 A**：底栏并行 Tab；产品顺序固定 **小屋 → 日历**（小屋在前）。勿重排底栏。

## 已交付

- 月 / 年 / 日视图（月默认）；手绘红圈情绪标记；产品 IP 伴侣插画
- 日视图多条日记：早→晚、同 mood 分组、左滑修改/删除、「继续记录」取当日最新 mood
- 保存带 `dateKey`（继续/选卡）；本地 + 已登录服务端同步
- 旧版「一日单对象」读时迁为数组；幂等 `entryId`（含 legacy 合成 id）

## 数据键（勿随意改名）

| 层 | 键 / 资源 | 说明 |
|----|-----------|------|
| 本地日期集合 | `aimu_mood_dates_v1__u_<userId>` | 有记录的 `YYYY-MM-DD`；登录后按用户隔离 |
| 本地日详情 | `aimu_mood_details_v1__u_<userId>` | `{ [dateKey]: MoodDayInfo[] }` |
| 遗留（无后缀） | `aimu_mood_dates_v1` / `aimu_mood_details_v1` | 首次 `bindMoodStorageToUser` 时在安全条件下迁入当前用户；不删其他用户 scoped 数据 |
| 归属标记 | `aimu_mood_owner_v1` | 当前本地 blob 归属的 userId |
| 服务端 | `GET/POST/DELETE /api/diary/entries` | 持久化见 `server/data/`（勿当调试垃圾删用户数据） |

实现入口：`src/components/calendar/`、`src/lib/calendarMood.ts`、`src/lib/diaryApi.ts`。视觉与交互细节见 `docs/CALENDAR.md`。
