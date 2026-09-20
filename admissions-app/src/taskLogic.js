// Shared task timeline logic (matches backend task_key / cycle)

function addDays(ts, days) {
  return ts + days * 86400000;
}

function daysSince(ts) {
  return Math.floor((Date.now() - ts) / 86400000);
}

export function getActiveTasks(admitTs) {
  if (!admitTs) return [];
  const days = daysSince(admitTs);
  const tasks = [];

  tasks.push({
    id: "hp",
    key: "hp",
    label: "H & P",
    dueDate: admitTs + 48 * 3600000,
    appearsOn: admitTs,
    cycle: 0,
  });

  if (days >= 21) {
    tasks.push({
      id: "30day",
      key: "30day",
      label: "30-Day",
      dueDate: addDays(admitTs, 30),
      appearsOn: addDays(admitTs, 21),
      cycle: 0,
    });
  }

  let cycle = 1;
  while (true) {
    const dueDay = 60 * cycle;
    const appearsDay = dueDay - 9;
    if (appearsDay > days) break;
    tasks.push({
      id: `60day-c${cycle}`,
      key: "60day",
      label: cycle === 1 ? "60-Day" : `60-Day #${cycle}`,
      dueDate: addDays(admitTs, dueDay),
      appearsOn: addDays(admitTs, appearsDay),
      cycle,
    });
    cycle++;
    if (cycle > 50) break;
  }

  return tasks;
}

export function mergeTaskState(activeTasks, savedState) {
  return activeTasks.map((def) => ({
    ...def,
    status: savedState[def.id]?.status || "pending",
    assignedAt: savedState[def.id]?.assignedAt || null,
    completedAt: savedState[def.id]?.completedAt || null,
    completedBy: savedState[def.id]?.completedBy || null,
    note: savedState[def.id]?.note || "",
    apiTaskId: savedState[def.id]?.apiTaskId || null,
  }));
}
