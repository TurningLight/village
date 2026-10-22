export function terminalDate(value: string | null | undefined, withTime = true) {
  if (!value || Number.isNaN(Date.parse(value))) return '时间未记录';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value));
}

export function monthLabel(month: string) {
  const [year, value] = month.split('-');
  return `${year} 年 ${Number(value)} 月`;
}
