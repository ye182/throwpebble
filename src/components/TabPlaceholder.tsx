type Props = { title: string };

export function TabPlaceholder({ title }: Props) {
  return (
    <div className="tab-placeholder">
      <p className="tab-placeholder-eyebrow">项目二 · 日记森林</p>
      <h2>{title}</h2>
      <p>这一页稍后完善，敬请期待。</p>
    </div>
  );
}
